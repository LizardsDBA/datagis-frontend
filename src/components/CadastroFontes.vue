<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ConstrutorCron from './ConstrutorCron.vue'
import ModalMapeamentoColunas from './ModalMapeamentoColunas.vue'

const router = useRouter()
const fonteParaMapeamento = ref(null)

const fontes = ref([])
const carregandoLista = ref(false)
const enviando = ref(false)
const erro = ref(null)
const sucesso = ref(false)

// null = cadastrando fonte nova; numero = editando a fonte com esse id.
const editandoId = ref(null)

const formVazio = () => ({
  nome: '',
  orgao: '',
  tipoAquisicao: 'UPLOAD_MANUAL',
  urlOrigem: '',
  cronExpressao: '',
  formatoEsperado: '',
  campoGeometriaLat: '',
  campoGeometriaLon: '',
  ativo: true,
})

const form = ref(formVazio())

// Estado de execucao por fonte (chave = id) — mais de uma linha pode, em tese, estar
// rodando ao mesmo tempo, entao cada uma tem seu proprio estado/cronometro/sondagem.
const execucoes = reactive({})

// /executar e /upload sao sincronos — a resposta HTTP so volta quando a ingestao
// inteira termina (achado ao vivo com o upload de 3,3GB do APPS: ficou minutos
// "pendurado" sem nenhum feedback alem do cronometro de segundos). Enquanto isso,
// sondamos /progresso em paralelo pra saber em que fase o backend esta.
const FASES_LABEL = {
  INICIANDO: 'Iniciando…',
  BUSCANDO_DADOS: 'Buscando dados na fonte…',
  DESCOMPACTANDO: 'Descompactando arquivo…',
  LENDO_REGISTROS: 'Lendo registros…',
  GRAVANDO: 'Gravando registros…',
  CONCLUIDO: 'Concluído',
  ERRO: 'Erro',
}
const INTERVALO_SONDAGEM_MS = 2000

function estadoDe(id) {
  if (!execucoes[id]) {
    execucoes[id] = {
      estado: 'ocioso',
      resultado: null,
      erro: null,
      segundos: 0,
      cronometro: null,
      progressoUploadPct: null,
      fase: null,
      registrosProcessados: 0,
      totalEstimado: null,
      percentual: null,
      detalhe: null,
      sondagem: null,
    }
  }
  return execucoes[id]
}

function zerarProgresso(est) {
  est.progressoUploadPct = null
  est.fase = null
  est.registrosProcessados = 0
  est.totalEstimado = null
  est.percentual = null
  est.detalhe = null
}

function iniciarSondagemDeProgresso(fonte) {
  const est = estadoDe(fonte.id)
  if (est.sondagem) return
  est.sondagem = setInterval(async () => {
    try {
      const resposta = await fetch(`/api/fontes/${fonte.id}/progresso`)
      if (!resposta.ok) return
      const corpo = await resposta.json()
      if (!corpo.fase) return
      est.fase = corpo.fase
      est.registrosProcessados = corpo.registrosProcessados
      est.totalEstimado = corpo.totalEstimado
      est.percentual = corpo.percentual
      est.detalhe = corpo.detalhe
    } catch (e) {
      // Sondagem e so cosmetica - uma falha aqui nao deve interromper a execucao real.
    }
  }, INTERVALO_SONDAGEM_MS)
}

function pararSondagemDeProgresso(fonte) {
  const est = estadoDe(fonte.id)
  if (est.sondagem) {
    clearInterval(est.sondagem)
    est.sondagem = null
  }
}

async function carregarFontes() {
  carregandoLista.value = true
  try {
    const resposta = await fetch('/api/fontes')
    fontes.value = await resposta.json()
  } catch (e) {
    erro.value = 'Não deu pra carregar a lista de fontes.'
  } finally {
    carregandoLista.value = false
  }
}

function editar(fonte) {
  editandoId.value = fonte.id
  form.value = {
    nome: fonte.nome,
    orgao: fonte.orgao || '',
    tipoAquisicao: fonte.tipoAquisicao,
    urlOrigem: fonte.urlOrigem || '',
    cronExpressao: fonte.cronExpressao || '',
    formatoEsperado: fonte.formatoEsperado || '',
    campoGeometriaLat: fonte.campoGeometriaLat || '',
    campoGeometriaLon: fonte.campoGeometriaLon || '',
    ativo: fonte.ativo,
  }
  sucesso.value = false
  erro.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelarEdicao() {
  editandoId.value = null
  form.value = formVazio()
  erro.value = null
}

async function salvar() {
  enviando.value = true
  erro.value = null
  sucesso.value = false
  try {
    const url = editandoId.value ? `/api/fontes/${editandoId.value}` : '/api/fontes'
    const metodo = editandoId.value ? 'PUT' : 'POST'
    const resposta = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null)
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    sucesso.value = true
    editandoId.value = null
    form.value = formVazio()
    await carregarFontes()
  } catch (e) {
    erro.value = e.message
  } finally {
    enviando.value = false
  }
}

async function executar(fonte) {
  const est = estadoDe(fonte.id)
  est.estado = 'executando'
  est.resultado = null
  est.erro = null
  est.segundos = 0
  zerarProgresso(est)
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)
  iniciarSondagemDeProgresso(fonte)

  try {
    const resposta = await fetch(`/api/fontes/${fonte.id}/executar`, { method: 'POST' })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    est.resultado = corpo
    est.estado = 'sucesso'
  } catch (e) {
    est.erro = e.message
    est.estado = 'erro'
  } finally {
    clearInterval(est.cronometro)
    est.cronometro = null
    pararSondagemDeProgresso(fonte)
    // No sucesso E no erro — sem isso, a duração/status/mensagem que o backend já
    // persistiu (mesmo quando a execução falha) nunca aparecem na tabela; a linha
    // ficava com "—" e um texto genérico de erro em vez do que aconteceu de verdade.
    await carregarFontes()
  }
}

// Upload manual (ex.: .zip de Shapefile) — um input de arquivo escondido, compartilhado
// entre as linhas; abre pelo botão da fonte e dispara o envio assim que escolher o arquivo.
const inputArquivoRef = ref(null)
const fonteParaUpload = ref(null)

function abrirSeletorArquivo(fonte) {
  fonteParaUpload.value = fonte
  inputArquivoRef.value?.click()
}

async function arquivoSelecionado(event) {
  const arquivo = event.target.files?.[0]
  event.target.value = '' // permite escolher o mesmo arquivo de novo numa proxima vez
  if (!arquivo || !fonteParaUpload.value) return
  await enviarUpload(fonteParaUpload.value, arquivo)
  fonteParaUpload.value = null
}

// XMLHttpRequest, não fetch — só o XHR expõe evento de progresso de ENVIO
// (upload.onprogress), o que dá o % real de bytes já transferidos ao servidor sem
// nenhum apoio do backend (fetch não tem esse evento pra upload).
function enviarUpload(fonte, arquivo) {
  const est = estadoDe(fonte.id)
  est.estado = 'executando'
  est.resultado = null
  est.erro = null
  est.segundos = 0
  zerarProgresso(est)
  est.progressoUploadPct = 0
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)

  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('arquivo', arquivo)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/fontes/${fonte.id}/upload`)

    xhr.upload.onprogress = (evento) => {
      if (!evento.lengthComputable) return
      est.progressoUploadPct = Math.round((evento.loaded / evento.total) * 100)
      // So faz sentido sondar a fase do backend (descompactando/gravando) depois que o
      // navegador termina de mandar os bytes - antes disso o servidor nem comecou.
      if (est.progressoUploadPct >= 100) {
        iniciarSondagemDeProgresso(fonte)
      }
    }

    const finalizar = async (sucesso, resultadoOuErro) => {
      clearInterval(est.cronometro)
      est.cronometro = null
      pararSondagemDeProgresso(fonte)
      if (sucesso) {
        est.resultado = resultadoOuErro
        est.estado = 'sucesso'
      } else {
        est.erro = resultadoOuErro
        est.estado = 'erro'
      }
      // No sucesso E no erro — mesmo motivo do executar(): sem isso a duração/status/
      // mensagem que o backend já persistiu nunca aparecem na tabela.
      await carregarFontes()
      resolve()
    }

    xhr.onload = () => {
      let corpo = null
      try {
        corpo = JSON.parse(xhr.responseText)
      } catch (e) {
        // resposta vazia ou não-JSON - trata como erro genérico abaixo.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        finalizar(true, corpo)
      } else {
        finalizar(false, corpo?.erro || `O servidor respondeu HTTP ${xhr.status}`)
      }
    }

    xhr.onerror = () => finalizar(false, 'Falha de rede ao enviar o arquivo.')

    xhr.send(formData)
  })
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

// Tempo da ÚLTIMA execução registrada no backend (persistido em fonte_dado, sobrevive
// a reload de página) — diferente do cronômetro ao vivo em `execucoes`, que só existe
// enquanto a aba está aberta.
function formatarDuracao(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1).replace('.', ',')}s`
}

onMounted(carregarFontes)
onUnmounted(() => {
  Object.values(execucoes).forEach((e) => {
    if (e.cronometro) clearInterval(e.cronometro)
    if (e.sondagem) clearInterval(e.sondagem)
  })
})
</script>

<template>
  <div>
    <p class="etiqueta">CADASTRO</p>
    <h1 class="titulo">Fontes de dados</h1>
    <p class="subtitulo">
      Fontes cadastradas e disparo manual de ingestão — cada fonte grava na zona bruta
      (schema-on-read), independente de qual seja.
    </p>

    <section class="cartao">
      <h2 class="cartao-titulo">{{ editandoId ? 'Editar fonte' : 'Nova fonte' }}</h2>
      <form class="formulario" @submit.prevent="salvar">
        <label>
          Nome
          <input v-model="form.nome" required placeholder="Ex.: IBAMA - Embargos" />
        </label>
        <label>
          Órgão
          <input v-model="form.orgao" placeholder="Ex.: IBAMA" />
        </label>
        <label>
          Como os dados chegam
          <select v-model="form.tipoAquisicao">
            <option value="UPLOAD_MANUAL">Upload manual</option>
            <option value="API_REST">API</option>
            <option value="DOWNLOAD_URL">Download por URL</option>
          </select>
        </label>
        <label v-if="form.tipoAquisicao !== 'UPLOAD_MANUAL'">
          URL de origem
          <input v-model="form.urlOrigem" placeholder="https://..." />
        </label>
        <label>
          Formato esperado
          <select v-model="form.formatoEsperado">
            <option value="">-</option>
            <option value="CSV">CSV</option>
            <option value="GEOJSON">GeoJSON</option>
            <option value="SHAPEFILE">Shapefile</option>
            <option value="JSON">JSON</option>
          </select>
        </label>
        <template v-if="form.formatoEsperado === 'CSV'">
          <label>
            Coluna de latitude (se tiver coordenada)
            <input v-model="form.campoGeometriaLat" placeholder="Ex.: lat" />
          </label>
          <label>
            Coluna de longitude (se tiver coordenada)
            <input v-model="form.campoGeometriaLon" placeholder="Ex.: lon" />
          </label>
        </template>
        <label>
          Agendamento (cron — ainda não é executado automaticamente)
          <ConstrutorCron v-model="form.cronExpressao" />
        </label>
        <label class="checkbox">
          <input v-model="form.ativo" type="checkbox" />
          Ativa
        </label>

        <div class="acoes-formulario">
          <button type="submit" class="botao-principal" :disabled="enviando">
            {{ enviando ? 'Salvando…' : (editandoId ? 'Salvar alterações' : 'Cadastrar fonte') }}
          </button>
          <button v-if="editandoId" type="button" class="botao-secundario" @click="cancelarEdicao">
            Cancelar
          </button>
        </div>
        <p v-if="sucesso" class="mensagem-ok">Fonte salva.</p>
        <p v-if="erro" class="mensagem-erro">{{ erro }}</p>
      </form>
    </section>

    <section class="cartao">
      <h2 class="cartao-titulo">Fontes cadastradas</h2>
      <p v-if="carregandoLista">Carregando…</p>
      <p v-else-if="!fontes.length">Nenhuma fonte cadastrada ainda.</p>
      <div v-else class="tabela-scroll">
        <table class="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Órgão</th>
              <th>Tipo</th>
              <th>Formato</th>
              <th>Ativa</th>
              <th>Última execução</th>
              <th>Cadastrada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="fonte in fontes" :key="fonte.id">
              <tr>
                <td>{{ fonte.nome }}</td>
                <td>{{ fonte.orgao || '-' }}</td>
                <td>{{ fonte.tipoAquisicao }}</td>
                <td>{{ fonte.formatoEsperado || '-' }}</td>
                <td>
                  <span class="pill" :class="fonte.ativo ? 'pill--ok' : 'pill--neutro'">
                    {{ fonte.ativo ? 'Ativa' : 'Inativa' }}
                  </span>
                </td>
                <td class="celula-ultima-execucao">
                  <div>{{ formatarData(fonte.ultimaExecucaoEm) }}</div>
                  <div v-if="fonte.ultimaDuracaoMs != null" class="linha-duracao">
                    <span>{{ formatarDuracao(fonte.ultimaDuracaoMs) }}</span>
                    <span class="pill" :class="fonte.ultimoStatusExecucao === 'ERRO' ? 'pill--erro' : 'pill--ok'">
                      {{ fonte.ultimoStatusExecucao === 'ERRO' ? 'Erro' : 'OK' }}
                    </span>
                  </div>
                  <div
                    v-if="fonte.ultimoStatusExecucao === 'ERRO' && fonte.ultimoErroMensagem"
                    class="mensagem-erro-fonte"
                    :title="fonte.ultimoErroMensagem"
                  >
                    {{ fonte.ultimoErroMensagem }}
                  </div>
                </td>
                <td>{{ formatarData(fonte.dataAdd) }}</td>
                <td class="celula-acoes">
                  <button class="botao-editar" title="Editar fonte" @click="editar(fonte)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button class="botao-mapeamento" title="Mapeamento de colunas (Bronze → Silver)" @click="fonteParaMapeamento = fonte">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="4" y1="9" x2="20" y2="9" />
                      <line x1="4" y1="15" x2="20" y2="15" />
                      <line x1="10" y1="3" x2="8" y2="21" />
                      <line x1="16" y1="3" x2="14" y2="21" />
                    </svg>
                  </button>
                  <button
                    v-if="fonte.tipoAquisicao === 'UPLOAD_MANUAL'"
                    class="botao-play"
                    :disabled="estadoDe(fonte.id).estado === 'executando'"
                    title="Enviar arquivo (.zip) e processar"
                    @click="abrirSeletorArquivo(fonte)"
                  >
                    <span v-if="estadoDe(fonte.id).estado === 'executando'" class="spinner" aria-hidden="true"></span>
                    <svg v-else class="icone-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="M12 3v12" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M7 8l5-5 5 5" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M5 21h14" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <button
                    v-else
                    class="botao-play"
                    :disabled="estadoDe(fonte.id).estado === 'executando'"
                    :title="'Executar ingestão de ' + fonte.nome"
                    @click="executar(fonte)"
                  >
                    <span v-if="estadoDe(fonte.id).estado === 'executando'" class="spinner" aria-hidden="true"></span>
                    <svg v-else class="icone-play" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="estadoDe(fonte.id).estado !== 'ocioso'" class="linha-resultado">
                <td colspan="8">
                  <div v-if="estadoDe(fonte.id).estado === 'executando'" class="resultado resultado--neutro">
                    <template v-if="estadoDe(fonte.id).progressoUploadPct !== null && estadoDe(fonte.id).progressoUploadPct < 100">
                      <div class="linha-fase">Enviando arquivo… {{ estadoDe(fonte.id).progressoUploadPct }}%</div>
                      <div class="barra-progresso">
                        <div class="barra-progresso-preenchida" :style="{ width: estadoDe(fonte.id).progressoUploadPct + '%' }"></div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="linha-fase">
                        {{ FASES_LABEL[estadoDe(fonte.id).fase] || 'Executando…' }} ({{ estadoDe(fonte.id).segundos }}s)
                      </div>
                      <div v-if="estadoDe(fonte.id).detalhe" class="detalhe-progresso">{{ estadoDe(fonte.id).detalhe }}</div>
                      <div v-if="estadoDe(fonte.id).percentual !== null" class="barra-progresso">
                        <div class="barra-progresso-preenchida" :style="{ width: estadoDe(fonte.id).percentual + '%' }"></div>
                      </div>
                      <div v-if="estadoDe(fonte.id).totalEstimado" class="contagem-progresso">
                        {{ estadoDe(fonte.id).registrosProcessados.toLocaleString('pt-BR') }} /
                        {{ estadoDe(fonte.id).totalEstimado.toLocaleString('pt-BR') }}
                        <template v-if="estadoDe(fonte.id).percentual !== null">({{ estadoDe(fonte.id).percentual }}%)</template>
                      </div>
                      <div v-else-if="estadoDe(fonte.id).registrosProcessados" class="contagem-progresso">
                        {{ estadoDe(fonte.id).registrosProcessados.toLocaleString('pt-BR') }} registros processados
                      </div>
                    </template>
                  </div>
                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado.status === 'SEM_MUDANCA'"
                    class="resultado resultado--neutro"
                  >
                    Nada mudou desde a última vez — lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }}, sem registros novos.
                  </div>
                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado.status === 'RETIDO_QUARENTENA'"
                    class="resultado resultado--alerta"
                  >
                    <div class="resultado-conteudo">
                      <div>
                        ⚠️ <strong>Lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }} retido na Quarentena!</strong>
                        Inconsistências foram detectadas no lote. Pela regra de integridade total (All-or-Nothing),
                        <strong>nenhum registro foi promovido para a Silver</strong> até que um analista valide a carga.
                      </div>
                      <div class="resultado-botoes">
                        <button
                          type="button"
                          class="btn-resultado-acao btn-quarentena"
                          @click="router.push({ path: '/quarentena', query: { loteId: estadoDe(fonte.id).resultado.loteIngestaoId } })"
                        >
                          Inspecionar na Quarentena
                        </button>
                        <button
                          type="button"
                          class="btn-resultado-acao btn-pipeline"
                          @click="router.push('/lotes')"
                        >
                          Ver no Pipeline
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado.status === 'PROMOVIDO_SILVER'"
                    class="resultado resultado--ok"
                  >
                    <div class="resultado-conteudo">
                      <div>
                        ✓ <strong>Lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }} promovido para a Silver!</strong>
                        (100% íntegro — {{ estadoDe(fonte.id).resultado.quantidadeRegistros?.toLocaleString('pt-BR') }} registros gravados com sucesso).
                      </div>
                      <div class="resultado-botoes">
                        <button
                          type="button"
                          class="btn-resultado-acao btn-pipeline"
                          @click="router.push('/lotes')"
                        >
                          Ver no Pipeline
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="estadoDe(fonte.id).estado === 'sucesso'" class="resultado resultado--ok">
                    Concluído — lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }},
                    {{ estadoDe(fonte.id).resultado.quantidadeRegistros.toLocaleString('pt-BR') }} registros gravados.
                  </div>
                  <div v-else-if="estadoDe(fonte.id).estado === 'erro'" class="resultado resultado--erro">
                    Falha: {{ estadoDe(fonte.id).erro }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <input
      ref="inputArquivoRef"
      type="file"
      accept=".zip"
      style="display: none"
      @change="arquivoSelecionado"
    />

    <!-- Modal de Mapeamentos de Colunas -->
    <ModalMapeamentoColunas
      :fonte="fonteParaMapeamento"
      @fechar="fonteParaMapeamento = null"
    />
  </div>
</template>

<style scoped>
.etiqueta {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e7d32;
}

.titulo {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
  color: #1a1a1a;
}

.subtitulo {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  color: #6b7280;
  max-width: 42rem;
}

.cartao {
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.cartao-titulo {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: #1a1a1a;
}

.formulario {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 28rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #444;
}

label.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

input,
select {
  padding: 0.5rem;
  font-size: 0.9rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: inherit;
}

.acoes-formulario {
  display: flex;
  gap: 0.6rem;
}

.botao-principal {
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  background: #2e7d32;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.botao-principal:disabled {
  opacity: 0.7;
  cursor: default;
}

.botao-secundario {
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #555;
  background: #f1f3f4;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.mensagem-ok {
  color: #2e7d32;
  font-size: 0.85rem;
}

.mensagem-erro {
  color: #a12a22;
  font-size: 0.85rem;
}

.tabela-scroll {
  overflow-x: auto;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tabela th,
.tabela td {
  text-align: left;
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
}

.pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.pill--ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.pill--neutro {
  background: #eef1f5;
  color: #667;
}

.pill--erro {
  background: #fdecea;
  color: #a12a22;
}

.celula-ultima-execucao {
  white-space: normal;
  max-width: 220px;
}

.linha-duracao {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: #6b7280;
}

.mensagem-erro-fonte {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: #a12a22;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.celula-acoes {
  display: flex;
  gap: 0.4rem;
}

.botao-editar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid #d5d9dd;
  background: #fff;
  color: #555;
  cursor: pointer;
}

.botao-editar svg {
  width: 0.85rem;
  height: 0.85rem;
}

.botao-play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: #2e7d32;
  color: #fff;
  cursor: pointer;
}

.botao-play:disabled {
  opacity: 0.6;
  cursor: default;
}

.icone-play {
  width: 0.85rem;
  height: 0.85rem;
}

.spinner {
  width: 0.85rem;
  height: 0.85rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: girar 0.7s linear infinite;
}

@keyframes girar {
  to { transform: rotate(360deg); }
}

.linha-resultado td {
  padding: 0 0.6rem 0.6rem;
  border-bottom: 1px solid #eee;
}

.resultado {
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  font-size: 0.82rem;
}

.resultado--ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.resultado--alerta {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.resultado-conteudo {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.resultado-botoes {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-resultado-acao {
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}

.btn-quarentena {
  background: #b45309;
  color: #ffffff;
}

.btn-quarentena:hover {
  background: #92400e;
}

.btn-pipeline {
  background: #ffffff;
  color: #334155;
  border-color: #cbd5e1;
}

.btn-pipeline:hover {
  background: #f1f5f9;
}

.botao-mapeamento {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0284c7;
  cursor: pointer;
  transition: all 0.12s;
}

.botao-mapeamento:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
}

.botao-mapeamento svg {
  width: 0.95rem;
  height: 0.95rem;
}

.resultado--neutro {
  background: #eef1f5;
  color: #556;
}

.resultado--erro {
  background: #fdecea;
  color: #a12a22;
}

.linha-fase {
  font-weight: 600;
}

.detalhe-progresso {
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: #6b7280;
}

.barra-progresso {
  margin-top: 0.4rem;
  height: 6px;
  border-radius: 999px;
  background: #dfe4ea;
  overflow: hidden;
}

.barra-progresso-preenchida {
  height: 100%;
  background: #2e7d32;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.contagem-progresso {
  margin-top: 0.3rem;
  font-size: 0.78rem;
  color: #556;
}
</style>

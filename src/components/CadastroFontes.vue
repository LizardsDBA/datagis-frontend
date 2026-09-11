<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import ConstrutorCron from './ConstrutorCron.vue'

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
// rodando ao mesmo tempo, entao cada uma tem seu proprio estado/cronometro.
const execucoes = reactive({})

function estadoDe(id) {
  if (!execucoes[id]) {
    execucoes[id] = { estado: 'ocioso', resultado: null, erro: null, segundos: 0, cronometro: null }
  }
  return execucoes[id]
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
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)

  try {
    const resposta = await fetch(`/api/fontes/${fonte.id}/executar`, { method: 'POST' })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    est.resultado = corpo
    est.estado = 'sucesso'
    await carregarFontes()
  } catch (e) {
    est.erro = e.message
    est.estado = 'erro'
  } finally {
    clearInterval(est.cronometro)
    est.cronometro = null
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

async function enviarUpload(fonte, arquivo) {
  const est = estadoDe(fonte.id)
  est.estado = 'executando'
  est.resultado = null
  est.erro = null
  est.segundos = 0
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)

  try {
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    const resposta = await fetch(`/api/fontes/${fonte.id}/upload`, { method: 'POST', body: formData })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    est.resultado = corpo
    est.estado = 'sucesso'
    await carregarFontes()
  } catch (e) {
    est.erro = e.message
    est.estado = 'erro'
  } finally {
    clearInterval(est.cronometro)
    est.cronometro = null
  }
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

onMounted(carregarFontes)
onUnmounted(() => {
  Object.values(execucoes).forEach((e) => e.cronometro && clearInterval(e.cronometro))
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
                <td>{{ formatarData(fonte.ultimaExecucaoEm) }}</td>
                <td>{{ formatarData(fonte.dataAdd) }}</td>
                <td class="celula-acoes">
                  <button class="botao-editar" title="Editar fonte" @click="editar(fonte)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
                    Executando… ({{ estadoDe(fonte.id).segundos }}s)
                  </div>
                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado.status === 'SEM_MUDANCA'"
                    class="resultado resultado--neutro"
                  >
                    Nada mudou desde a última vez — lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }}, sem registros novos.
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

.resultado--neutro {
  background: #eef1f5;
  color: #556;
}

.resultado--erro {
  background: #fdecea;
  color: #a12a22;
}
</style>

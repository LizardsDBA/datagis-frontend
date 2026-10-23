<script setup>
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { apiFetch } from '../services/http'
import { useRouter } from 'vue-router'
import ConstrutorCron from './ConstrutorCron.vue'
import ModalMapeamentoColunas from './ModalMapeamentoColunas.vue'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

const router = useRouter()

// Quem so visualiza fontes (ex.: Analista, Auditor) ve a lista sem os botoes de alterar,
// executar ou enviar arquivo (LIZARDS-45); o backend barra com 403 de qualquer jeito.
const podeGerenciar = temPermissao(PERMISSOES.FONTE_GERENCIAR)
const podeVerDados = temPermissao(PERMISSOES.DADOS_VISUALIZAR)
const fonteParaMapeamento = ref(null)

const fontes = ref([])
const carregandoLista = ref(false)
const enviando = ref(false)
const erro = ref(null)
const sucesso = ref(false)

// Controle de expansão de mensagens de erro longas por fonte
const errosExpandidos = reactive({})

function alternarErroExpandido(fonteId) {
  errosExpandidos[fonteId] = !errosExpandidos[fonteId]
}

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
  separadorCsv: ',',
  ativo: true,
  // Não aparece no formulário (é definida no Mapeamento de Colunas), mas vai no salvar:
  // o PUT grava o que receber, e sem ela a edição apagava a tabela Silver da fonte
  entidadeSilver: null,
})

const form = ref(formVazio())

// Falso enquanto a atualização automática está ligada sem frequência e horário escolhidos
const agendamentoCompleto = ref(true)

// A tela abre direto na lista; o formulario de cadastro/edicao vira pop-up.
const modalAberto = ref(false)

function abrirCadastro() {
  editandoId.value = null
  form.value = formVazio()
  erro.value = null
  sucesso.value = false
  modalAberto.value = true
}

function fecharModal() {
  modalAberto.value = false
  editandoId.value = null
  form.value = formVazio()
  erro.value = null
}

// A confirmacao aparece na pagina, ja com o modal fechado, e some sozinha.
let temporizadorSucesso = null

function mostrarSucesso() {
  sucesso.value = true
  clearTimeout(temporizadorSucesso)
  temporizadorSucesso = setTimeout(() => {
    sucesso.value = false
  }, 4000)
}

function aoPressionarEsc(evento) {
  if (evento.key === 'Escape' && modalAberto.value) fecharModal()
}

// Trava a rolagem do fundo enquanto o modal estiver aberto.
watch(modalAberto, (aberto) => {
  document.body.style.overflow = aberto ? 'hidden' : ''
})

// Estado de execucao por fonte (chave = id)
const execucoes = reactive({})

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

// value="\t" em HTML puro vira a string literal de 2 caracteres "\t", nao uma
// tabulacao de verdade - por isso o <select> usa :value ligado a este array (string
// JS real) em vez de "\t" escrito direto no atributo do <option>.
const OPCOES_SEPARADOR_CSV = [
  { valor: ',', rotulo: 'Vírgula ( , )' },
  { valor: ';', rotulo: 'Ponto e vírgula ( ; )' },
  { valor: '|', rotulo: 'Pipe ( | )' },
  { valor: '\t', rotulo: 'Tabulação ( TAB )' },
]
const SEPARADOR_LABEL = Object.fromEntries(OPCOES_SEPARADOR_CSV.map((o) => [o.valor, o.rotulo]))

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
      const resposta = await apiFetch(`/api/fontes/${fonte.id}/progresso`)
      if (!resposta.ok) return
      const corpo = await resposta.json()
      if (!corpo.fase) return
      est.fase = corpo.fase
      est.registrosProcessados = corpo.registrosProcessados
      est.totalEstimado = corpo.totalEstimado
      est.percentual = corpo.percentual
      est.detalhe = corpo.detalhe

      if (corpo.fase === 'CONCLUIDO') {
        pararSondagemDeProgresso(fonte)
        if (est.cronometro) {
          clearInterval(est.cronometro)
          est.cronometro = null
        }
        est.estado = 'sucesso'
        est.resultado = {
          quantidadeRegistros: corpo.registrosProcessados,
          status: 'CONCLUIDO',
        }
        await carregarFontes()
      } else if (corpo.fase === 'ERRO') {
        pararSondagemDeProgresso(fonte)
        if (est.cronometro) {
          clearInterval(est.cronometro)
          est.cronometro = null
        }
        est.estado = 'erro'
        est.erro = corpo.detalhe || 'Falha na ingestão da fonte.'
        await carregarFontes()
      }
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
    const resposta = await apiFetch('/api/fontes')
    fontes.value = await resposta.json()
    verificarExecucoesAtivas(fontes.value)
  } catch (e) {
    erro.value = 'Não deu pra carregar a lista de fontes.'
  } finally {
    carregandoLista.value = false
  }
}

async function verificarExecucoesAtivas(listaFontes) {
  if (!listaFontes || !Array.isArray(listaFontes)) return
  for (const fonte of listaFontes) {
    try {
      const resp = await apiFetch(`/api/fontes/${fonte.id}/progresso`)
      if (resp.ok) {
        const progresso = await resp.json()
        if (progresso.fase && progresso.fase !== 'CONCLUIDO' && progresso.fase !== 'ERRO' && progresso.fase !== 'OCIOSO') {
          const est = estadoDe(fonte.id)
          est.estado = 'executando'
          est.fase = progresso.fase
          est.registrosProcessados = progresso.registrosProcessados || 0
          est.totalEstimado = progresso.totalEstimado || null
          est.percentual = progresso.percentual || null
          est.detalhe = progresso.detalhe || null
          if (!est.cronometro) {
            est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)
          }
          iniciarSondagemDeProgresso(fonte)
        }
      }
    } catch (e) {
      // ignora falhas transitórias
    }
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
    separadorCsv: fonte.separadorCsv || ',',
    ativo: fonte.ativo,
    entidadeSilver: fonte.entidadeSilver || null,
  }
  sucesso.value = false
  erro.value = null
 modalAberto.value = true
}

async function salvar() {
  if (!agendamentoCompleto.value) return
  enviando.value = true
  erro.value = null
  sucesso.value = false
  try {
    const url = editandoId.value ? `/api/fontes/${editandoId.value}` : '/api/fontes'
    const metodo = editandoId.value ? 'PUT' : 'POST'
    const resposta = await apiFetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null)
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    mostrarSucesso()
    fecharModal()
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
  if (est.cronometro) clearInterval(est.cronometro)
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)
  iniciarSondagemDeProgresso(fonte)

  try {
    const resposta = await apiFetch(`/api/fontes/${fonte.id}/executar`, { method: 'POST' })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    if (resposta.status === 200 && corpo?.quantidadeRegistros !== undefined) {
      est.resultado = corpo
      est.estado = 'sucesso'
      pararSondagemDeProgresso(fonte)
      if (est.cronometro) {
        clearInterval(est.cronometro)
        est.cronometro = null
      }
      await carregarFontes()
    }
  } catch (e) {
    est.erro = e.message
    est.estado = 'erro'
    if (est.cronometro) {
      clearInterval(est.cronometro)
      est.cronometro = null
    }
    pararSondagemDeProgresso(fonte)
    await carregarFontes()
  }
}

const inputArquivoRef = ref(null)
const fonteParaUpload = ref(null)

function abrirSeletorArquivo(fonte) {
  fonteParaUpload.value = fonte
  inputArquivoRef.value?.click()
}

async function arquivoSelecionado(event) {
  const arquivo = event.target.files?.[0]
  event.target.value = ''
  if (!arquivo || !fonteParaUpload.value) return
  await enviarUpload(fonteParaUpload.value, arquivo)
  fonteParaUpload.value = null
}

function enviarUpload(fonte, arquivo) {
  const est = estadoDe(fonte.id)
  est.estado = 'executando'
  est.resultado = null
  est.erro = null
  est.segundos = 0
  zerarProgresso(est)
  est.progressoUploadPct = 0
  if (est.cronometro) clearInterval(est.cronometro)
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)

  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('arquivo', arquivo)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/fontes/${fonte.id}/upload`)

    xhr.upload.onprogress = (evento) => {
      if (!evento.lengthComputable) return
      est.progressoUploadPct = Math.round((evento.loaded / evento.total) * 100)
      if (est.progressoUploadPct >= 100) {
        iniciarSondagemDeProgresso(fonte)
      }
    }

    const finalizar = async (sucesso, resultadoOuErro) => {
      if (est.cronometro) {
        clearInterval(est.cronometro)
        est.cronometro = null
      }
      pararSondagemDeProgresso(fonte)
      if (sucesso) {
        est.resultado = resultadoOuErro
        est.estado = 'sucesso'
      } else {
        est.erro = resultadoOuErro
        est.estado = 'erro'
      }
      await carregarFontes()
      resolve()
    }

    xhr.onload = () => {
      let corpo = null
      try {
        corpo = JSON.parse(xhr.responseText)
      } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 200 && corpo?.quantidadeRegistros !== undefined) {
          finalizar(true, corpo)
        } else {
          iniciarSondagemDeProgresso(fonte)
        }
      } else {
        finalizar(false, corpo?.erro || `O servidor respondeu HTTP ${xhr.status}`)
      }
    }

    xhr.onerror = () => finalizar(false, 'Falha de rede ao enviar o arquivo.')
    xhr.send(formData)
  })
}

function podeExecutar(fonte) {
  if (!fonte) return false
  return fonte.mapeamentoCompleto === true && !!fonte.entidadeSilver
}

function obterTooltipExecucao(fonte, tipo) {
  if (!fonte) return ''
  if (fonte.mapeamentoCompleto === false) {
    const faltam = (fonte.totalColunasSilver || 0) - (fonte.totalColunasMapeadas || 0)
    const nomes = fonte.colunasSilverFaltantes?.length ? ` (${fonte.colunasSilverFaltantes.join(', ')})` : ''
    return `Mapeamento incompleto: faltam ${faltam > 0 ? faltam : ''} colunas da tabela Silver${nomes}. Mapeie todas as colunas para liberar a ingestão.`
  }
  if (!fonte.entidadeSilver) {
    return 'Mapeamento incompleto: nenhuma tabela Silver configurada para esta fonte.'
  }
  return tipo === 'upload'
    ? 'Enviar arquivo (.zip / shapefile / csv) e executar ingestão'
    : 'Disparar ingestão remota de ' + fonte.nome
}

async function fecharModalMapeamento() {
  fonteParaMapeamento.value = null
  await carregarFontes()
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

const DIAS_SEMANA_CRON = {
  MON: 'segunda', TUE: 'terça', WED: 'quarta', THU: 'quinta',
  FRI: 'sexta', SAT: 'sábado', SUN: 'domingo',
}

// Traduz as expressoes que o ConstrutorCron gera. Qualquer outra (modo
// "Personalizado") aparece como veio, sem tentar adivinhar.
function descreverCron(expressao) {
  if (!expressao) return null
  const campos = expressao.trim().split(/\s+/)
  if (campos.length !== 6) return expressao

  const [, minuto, hora, diaDoMes, , diaDaSemana] = campos
  if (!/^\d+$/.test(minuto) || !/^\d+$/.test(hora)) return expressao
  const horario = `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}`

  if (diaDoMes === '*' && diaDaSemana === '?') return `Todo dia às ${horario}`
  if (diaDoMes === '?' && DIAS_SEMANA_CRON[diaDaSemana]) return `Toda ${DIAS_SEMANA_CRON[diaDaSemana]} às ${horario}`
  if (diaDaSemana === '?' && /^\d+$/.test(diaDoMes)) return `Todo dia ${diaDoMes} às ${horario}`
  return expressao
}

function formatarDuracao(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1).replace('.', ',')}s`
}

onMounted(() => {
  carregarFontes()
  window.addEventListener('keydown', aoPressionarEsc)
})
onUnmounted(() => {
  window.removeEventListener('keydown', aoPressionarEsc)
  document.body.style.overflow = ''
  clearTimeout(temporizadorSucesso)
  Object.values(execucoes).forEach((e) => {
    if (e.cronometro) clearInterval(e.cronometro)
    if (e.sondagem) clearInterval(e.sondagem)
  })
})
</script>

<template>
  <div class="pagina-fontes">
    <!-- Cabeçalho Principal -->
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">CADASTRO E INGESTÃO</p>
        <h1 class="titulo">Fontes de Dados</h1>
        <p class="subtitulo">
          Catálogo de fontes de dados geoespaciais e disparo de ingestão para a camada Bronze (schema-on-read).
        </p>
      </div>

      <div class="topo-acoes">
        <button class="btn-recarregar" @click="carregarFontes" :disabled="carregandoLista" title="Recarregar lista de fontes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          <span>Atualizar</span>
        </button>

        <button v-if="podeGerenciar" class="btn-adicionar-fonte" @click="abrirCadastro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span>Adicionar fonte</span>
        </button>
      </div>
    </header>

    <!-- Seção de Formulário de Cadastro / Edição (em modal) -->
    <div v-if="modalAberto" class="modal-backdrop" @click.self="fecharModal">
      <div class="modal-dialog">
        <button class="btn-fechar" @click="fecharModal" aria-label="Fechar">✕</button>
        <section class="cartao">
      <div class="cartao-header">
        <div class="cartao-header-icone">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <div>
          <h2 class="cartao-titulo">{{ editandoId ? 'Editar Fonte #' + editandoId : 'Cadastrar Nova Fonte de Dados' }}</h2>
          <p class="cartao-sub">Configure os parâmetros de aquisição, URLs de origem e regras de formato.</p>
        </div>
      </div>

      <form class="formulario-grid" @submit.prevent="salvar">
        <div class="campo-grupo">
          <label class="campo-label">
            Nome da Fonte *
            <input v-model="form.nome" required placeholder="Ex.: IBAMA - Embargos Ambientais" class="campo-input" />
          </label>
        </div>

        <div class="campo-grupo">
          <label class="campo-label">
            Órgão Emissor / Fornecedor
            <input v-model="form.orgao" placeholder="Ex.: IBAMA, SICAR, ICMBio, IAT" class="campo-input" />
          </label>
        </div>

        <div class="campo-grupo">
          <label class="campo-label">
            Modalidade de Aquisição *
            <select v-model="form.tipoAquisicao" class="campo-select">
              <option value="UPLOAD_MANUAL">Upload manual (.zip, .csv, shapefile)</option>
              <option value="API_REST">API REST / GeoServer WFS</option>
              <option value="DOWNLOAD_URL">Download direto por URL</option>
            </select>
          </label>
        </div>

        <div class="campo-grupo" v-if="form.tipoAquisicao !== 'UPLOAD_MANUAL'">
          <label class="campo-label">
            URL de Origem (Endpoint / Download) *
            <input v-model="form.urlOrigem" required placeholder="https://dados.gov.br/api/geospatial..." class="campo-input" />
          </label>
        </div>

        <div class="campo-grupo">
          <label class="campo-label">
            Formato Esperado
            <select v-model="form.formatoEsperado" class="campo-select">
              <option value="">Indefinido / Autodetectar</option>
              <option value="SHAPEFILE">Shapefile (.zip com shp, shx, dbf, prj)</option>
              <option value="GEOJSON">GeoJSON</option>
              <option value="CSV">CSV com coordenadas</option>
              <option value="JSON">JSON / GeoServices</option>
            </select>
          </label>
        </div>

        <template v-if="form.formatoEsperado === 'CSV'">
          <div class="campo-grupo">
            <label class="campo-label">
              Separador de Campo
              <select v-model="form.separadorCsv" class="campo-select">
                <option v-for="opcao in OPCOES_SEPARADOR_CSV" :key="opcao.valor" :value="opcao.valor">
                  {{ opcao.rotulo }}
                </option>
              </select>
            </label>
          </div>
          <div class="campo-grupo">
            <label class="campo-label">
              Nome da Coluna de Latitude
              <input v-model="form.campoGeometriaLat" placeholder="Ex.: latitude, lat, Y" class="campo-input" />
            </label>
          </div>
          <div class="campo-grupo">
            <label class="campo-label">
              Nome da Coluna de Longitude
              <input v-model="form.campoGeometriaLon" placeholder="Ex.: longitude, lon, long, X" class="campo-input" />
            </label>
          </div>
        </template>

        <div class="campo-grupo campo-grupo--full">
          <label class="campo-label">
            Agendamento Automático de Execução (Quartz Cron)
            <ConstrutorCron v-model="form.cronExpressao" v-model:completo="agendamentoCompleto" />
          </label>
        </div>

        <div class="campo-grupo campo-grupo--checkbox">
          <label class="checkbox-custom">
            <input v-model="form.ativo" type="checkbox" />
            <span class="checkbox-box"></span>
            <span class="checkbox-texto">Fonte ativa para ingestão</span>
          </label>
        </div>

        <!-- Mensagens e Ações -->
        <div class="acoes-formulario campo-grupo--full">
          <button type="submit" class="botao-principal" :disabled="enviando || !agendamentoCompleto">
            <span v-if="enviando" class="spinner-sm"></span>
            <span>{{ enviando ? 'Gravando alterações…' : (editandoId ? 'Salvar Alterações' : 'Cadastrar Fonte') }}</span>
          </button>

         <button type="button" class="botao-secundario" @click="fecharModal">
            Cancelar
          </button>
        </div>

        
        <div v-if="erro" class="alerta-erro campo-grupo--full">
          ✕ Falha: {{ erro }}
        </div>
      </form>
        </section>
      </div>
    </div>

        <div v-if="sucesso" class="alerta-sucesso alerta-pagina">
      ✓ Fonte salva com sucesso! O catálogo de dados foi atualizado.
    </div>

    <!-- Tabela de Fontes Cadastradas -->
    <section class="cartao">
      <div class="cartao-header cartao-header--tabela">
        <div>
          <h2 class="cartao-titulo">Fontes Cadastradas ({{ fontes.length }})</h2>
          <p class="cartao-sub">Execute a extração dos dados ou envie novos lotes através dos botões de ação.</p>
        </div>
      </div>

      <div v-if="carregandoLista" class="estado-carregando">
        <div class="spinner-grande"></div>
        <span>Carregando fontes de dados...</span>
      </div>

      <div v-else-if="!fontes.length" class="estado-vazio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <p>Nenhuma fonte cadastrada ainda.</p>
        <small>Preencha o formulário acima para adicionar a primeira fonte.</small>
      </div>

      <div v-else class="tabela-responsiva-wrapper">
        <table class="tabela-fontes">
          <thead>
            <tr>
              <th>Fonte / Órgão</th>
              <th>Modalidade</th>
              <th>Formato</th>
              <th>Status</th>
              <th>Agendamento</th>
              <th>Última Execução</th>
              <th>Cadastrada em</th>
              <th class="col-acoes-titulo">Ações</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="fonte in fontes" :key="fonte.id">
              <tr class="linha-fonte">
                <!-- Nome e Órgão e URL exposta -->
                <td class="celula-fonte-principal">
                  <div class="fonte-nome-linha">
                    <span class="fonte-id">#{{ fonte.id }}</span>
                    <strong class="fonte-nome">{{ fonte.nome }}</strong>
                  </div>
                  <div class="fonte-orgao-texto">
                    {{ fonte.orgao ? 'Órgão: ' + fonte.orgao : 'Sem órgão informado' }}
                  </div>
                  <!-- Indicador de Status do Mapeamento Silver (exibido apenas quando pendente) -->
                  <div v-if="!fonte.mapeamentoCompleto || !fonte.entidadeSilver" class="linha-status-silver">
                    <span
                      v-if="fonte.entidadeSilver"
                      class="badge-mapeamento-status badge-mapeamento--pendente"
                      :title="'Mapeamento incompleto (' + (fonte.totalColunasMapeadas || 0) + '/' + (fonte.totalColunasSilver || 0) + ' colunas). Faltam: ' + (fonte.colunasSilverFaltantes?.join(', ') || 'colunas') + '. Ingestão bloqueada.'"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      Mapeamento Incompleto ({{ fonte.totalColunasMapeadas || 0 }}/{{ fonte.totalColunasSilver || 0 }})
                    </span>
                    <span v-else class="badge-mapeamento-status badge-mapeamento--sem-silver" title="Defina a tabela Silver no mapeamento para liberar a ingestão">
                      Sem Tabela Silver
                    </span>
                  </div>
                  <!-- Informação que antes estava escondida: URL de origem exposta diretamente -->
                  <div v-if="fonte.urlOrigem" class="fonte-url-preview" :title="fonte.urlOrigem">
                    <span class="url-texto">{{ fonte.urlOrigem }}</span>
                  </div>
                </td>

                <!-- Tipo de Aquisição -->
                <td>
                  <span class="badge-modalidade" :class="'modalidade--' + fonte.tipoAquisicao.toLowerCase()">
                    {{
                      fonte.tipoAquisicao === 'UPLOAD_MANUAL' ? 'Upload Manual' :
                      fonte.tipoAquisicao === 'API_REST' ? 'API REST' :
                      fonte.tipoAquisicao === 'DOWNLOAD_URL' ? 'Download URL' : fonte.tipoAquisicao
                    }}
                  </span>
                </td>

                <!-- Formato -->
                <td>
                  <span class="badge-formato">{{ fonte.formatoEsperado || 'Autodetectar' }}</span>
                  <div v-if="fonte.formatoEsperado === 'CSV'" class="tag-geo-hint">
                    Separador: {{ SEPARADOR_LABEL[fonte.separadorCsv] || fonte.separadorCsv || 'Vírgula' }}
                  </div>
                  <div v-if="fonte.campoGeometriaLat" class="tag-geo-hint">
                    Coord: {{ fonte.campoGeometriaLat }}, {{ fonte.campoGeometriaLon }}
                  </div>
                </td>

                <!-- Ativa / Inativa -->
                <td>
                  <span class="badge-tag" :class="fonte.ativo ? 'badge-tag--sucesso' : 'badge-tag--neutro'">
                    {{ fonte.ativo ? 'Ativa' : 'Inativa' }}
                  </span>
                </td>

                <!-- Agendamento automático (cron do Quartz) -->
                <td class="celula-agendamento">
                  <template v-if="fonte.cronExpressao">
                    <div class="agendamento-texto">{{ descreverCron(fonte.cronExpressao) }}</div>
                    <code class="agendamento-cron">{{ fonte.cronExpressao }}</code>
                  </template>
                  <span v-else class="agendamento-vazio">Somente manual</span>
                </td>

                <!-- Última Execução e Detalhes de Erro Completos -->
                <td class="celula-ultima-execucao">
                  <div class="data-execucao">{{ formatarData(fonte.ultimaExecucaoEm) }}</div>

                  <div v-if="fonte.ultimaDuracaoMs != null" class="linha-duracao">
                    <span class="duracao-texto">{{ formatarDuracao(fonte.ultimaDuracaoMs) }}</span>
                    <span class="badge-tag" :class="fonte.ultimoStatusExecucao === 'ERRO' ? 'badge-tag--erro' : 'badge-tag--sucesso'">
                      {{ fonte.ultimoStatusExecucao === 'ERRO' ? 'Falha' : 'OK' }}
                    </span>
                  </div>

                  <!-- Mensagem de erro sem truncamento e com toggle de expansão -->
                  <div v-if="fonte.ultimoStatusExecucao === 'ERRO' && fonte.ultimoErroMensagem" class="container-erro-fonte">
                    <p class="mensagem-erro-texto" :class="{ 'erro-expandido': errosExpandidos[fonte.id] }">
                      {{ fonte.ultimoErroMensagem }}
                    </p>
                    <button
                      v-if="fonte.ultimoErroMensagem.length > 80"
                      type="button"
                      class="btn-toggle-erro"
                      @click="alternarErroExpandido(fonte.id)"
                    >
                      {{ errosExpandidos[fonte.id] ? '▲ Ocultar detalhes' : '▼ Ver erro completo' }}
                    </button>
                  </div>
                </td>

                <!-- Cadastrada em -->
                <td class="celula-data-add">
                  {{ formatarData(fonte.dataAdd) }}
                </td>

                <!-- Ações -->
                <td class="celula-acoes">
                  <div class="grupo-botoes-acoes">
                    <button
                      v-if="podeGerenciar"
                      class="btn-acao-circulo btn-editar"
                      title="Editar configurações da fonte"
                      @click="editar(fonte)"
                      aria-label="Editar fonte"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>

                    <button
                      class="btn-acao-circulo btn-mapeamento"
                      title="Mapeamento De-Para de Colunas (Bronze → Silver)"
                      @click="fonteParaMapeamento = fonte"
                      aria-label="Mapeamento de colunas"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="4" y1="9" x2="20" y2="9" />
                        <line x1="4" y1="15" x2="20" y2="15" />
                        <line x1="10" y1="3" x2="8" y2="21" />
                        <line x1="16" y1="3" x2="14" y2="21" />
                      </svg>
                    </button>

                    <button
                      v-if="podeGerenciar && fonte.tipoAquisicao === 'UPLOAD_MANUAL'"
                      class="btn-acao-circulo btn-executar"
                      :disabled="!podeExecutar(fonte) || estadoDe(fonte.id).estado === 'executando'"
                      :title="obterTooltipExecucao(fonte, 'upload')"
                      @click="abrirSeletorArquivo(fonte)"
                      aria-label="Fazer upload de arquivo"
                    >
                      <span v-if="estadoDe(fonte.id).estado === 'executando'" class="spinner-sm-branco"></span>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M12 3v12" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M7 8l5-5 5 5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M5 21h14" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>

                    <button
                      v-else-if="podeGerenciar"
                      class="btn-acao-circulo btn-executar"
                      :disabled="!podeExecutar(fonte) || estadoDe(fonte.id).estado === 'executando'"
                      :title="obterTooltipExecucao(fonte, 'executar')"
                      @click="executar(fonte)"
                      aria-label="Executar ingestão"
                    >
                      <span v-if="estadoDe(fonte.id).estado === 'executando'" class="spinner-sm-branco"></span>
                      <svg v-else viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>

                    <button
                      v-if="podeVerDados"
                      class="btn-acao-circulo btn-conjunto-dados"
                      title="Ver Conjunto de Dados (Bronze / Silver / Quarentena)"
                      @click="router.push('/conjuntos-dados/' + fonte.id)"
                      aria-label="Ver conjunto de dados"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Linha de Feedback de Execução em Andamento / Concluída -->
              <tr v-if="estadoDe(fonte.id).estado !== 'ocioso'" class="linha-resultado">
                <td colspan="8">
                  <div v-if="estadoDe(fonte.id).estado === 'executando'" class="banner-progresso">
                    <template v-if="estadoDe(fonte.id).progressoUploadPct !== null && estadoDe(fonte.id).progressoUploadPct < 100">
                      <div class="linha-fase">
                        <span>Enviando arquivo para o servidor...</span>
                        <strong>{{ estadoDe(fonte.id).progressoUploadPct }}%</strong>
                      </div>
                      <div class="trilho-progresso">
                        <div class="barra-preenchida" :style="{ width: estadoDe(fonte.id).progressoUploadPct + '%' }"></div>
                      </div>
                    </template>

                    <template v-else>
                      <div class="linha-fase">
                        <span>{{ FASES_LABEL[estadoDe(fonte.id).fase] || 'Executando pipeline de ingestão…' }}</span>
                        <span class="tempo-decorrido">({{ estadoDe(fonte.id).segundos }}s decorridos)</span>
                      </div>
                      <div v-if="estadoDe(fonte.id).detalhe" class="detalhe-fase">
                        {{ estadoDe(fonte.id).detalhe }}
                      </div>
                      <div v-if="estadoDe(fonte.id).percentual !== null" class="trilho-progresso">
                        <div class="barra-preenchida" :style="{ width: estadoDe(fonte.id).percentual + '%' }"></div>
                      </div>
                      <div v-if="estadoDe(fonte.id).totalEstimado" class="contagem-progresso">
                        {{ estadoDe(fonte.id).registrosProcessados.toLocaleString('pt-BR') }} /
                        {{ estadoDe(fonte.id).totalEstimado.toLocaleString('pt-BR') }} registros
                        <template v-if="estadoDe(fonte.id).percentual !== null">({{ estadoDe(fonte.id).percentual }}%)</template>
                      </div>
                      <div v-else-if="estadoDe(fonte.id).registrosProcessados" class="contagem-progresso">
                        {{ estadoDe(fonte.id).registrosProcessados.toLocaleString('pt-BR') }} registros processados
                      </div>
                    </template>
                  </div>

                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado?.status === 'SEM_MUDANCA'"
                    class="resultado-banner resultado-banner--neutro"
                  >
                    <strong>Conteúdo inalterado:</strong> Lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }} verificado — nenhum registro novo encontrado na origem.
                  </div>

                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado?.status === 'RETIDO_QUARENTENA'"
                    class="resultado-banner resultado-banner--alerta"
                  >
                    <div class="resultado-alerta-corpo">
                      <div>
                        <strong>Lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }} retido na Quarentena!</strong>
                        <p class="alerta-regra">
                          Pela regra de integridade total (All-or-Nothing), <strong>nenhum registro foi promovido para a Silver</strong> até que as inconsistências sejam validadas por um analista.
                        </p>
                      </div>
                      <div class="resultado-botoes-atalho">
                        <button
                          type="button"
                          class="btn-atalho btn-atalho--quarentena"
                          @click="router.push({ path: '/quarentena', query: { loteId: estadoDe(fonte.id).resultado.loteIngestaoId } })"
                        >
                          Inspecionar na Quarentena →
                        </button>
                        <button
                          type="button"
                          class="btn-atalho btn-atalho--pipeline"
                          @click="router.push('/lotes')"
                        >
                          Ver no Pipeline
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado?.status === 'PROMOVIDO_SILVER'"
                    class="resultado-banner resultado-banner--sucesso"
                  >
                    <div class="resultado-alerta-corpo">
                      <div>
                        ✓ <strong>Tudo certo! O lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }} foi para a Silver.</strong>
                        <p class="alerta-regra">
                          {{ estadoDe(fonte.id).resultado.quantidadeRegistros?.toLocaleString('pt-BR') }} registros salvos.
                        </p>
                      </div>
                      <div class="resultado-botoes-atalho">
                        <button
                          type="button"
                          class="btn-atalho btn-atalho--pipeline"
                          @click="router.push('/lotes')"
                        >
                          Ver no Pipeline →
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="estadoDe(fonte.id).estado === 'sucesso'" class="resultado-banner resultado-banner--sucesso">
                    ✓ Concluído com sucesso — Lote #{{ estadoDe(fonte.id).resultado?.loteIngestaoId }},
                    {{ estadoDe(fonte.id).resultado?.quantidadeRegistros?.toLocaleString('pt-BR') }} registros processados.
                  </div>

                  <div v-else-if="estadoDe(fonte.id).estado === 'erro'" class="resultado-banner resultado-banner--erro">
                    ✕ <strong>Falha na execução:</strong> {{ estadoDe(fonte.id).erro }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Input Oculto de Arquivo -->
    <input
      ref="inputArquivoRef"
      type="file"
      accept=".zip,.csv,.json,.geojson"
      style="display: none"
      @change="arquivoSelecionado"
    />

    <!-- Modal de Mapeamento de Colunas -->
    <ModalMapeamentoColunas
      :fonte="fonteParaMapeamento"
      @fechar="fecharModalMapeamento"
      @atualizado="carregarFontes"
    />
  </div>
</template>

<style scoped>
.pagina-fontes {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.etiqueta {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #15803d;
}

.titulo {
  font-size: 1.65rem;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.subtitulo {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 48rem;
}

.btn-recarregar {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-recarregar:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.btn-recarregar svg {
  width: 1rem;
  height: 1rem;
}

/* Cartões Principais */
.cartao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.cartao-header {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #f1f5f9;
}

.cartao-header-icone {
  width: 2.4rem;
  height: 2.4rem;
  background: #dcfce7;
  color: #15803d;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cartao-header-icone svg {
  width: 1.25rem;
  height: 1.25rem;
}

.cartao-titulo {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.cartao-sub {
  font-size: 0.82rem;
  color: #64748b;
  margin-top: 0.15rem;
}

/* Formulário Responsivo em Grid */
.formulario-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}

.campo-grupo {
  display: flex;
  flex-direction: column;
}

.campo-grupo--full {
  grid-column: span 2;
}

.campo-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}

.campo-input,
.campo-select {
  padding: 0.65rem 0.85rem;
  font-size: 0.88rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background-color: #ffffff;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;
}

.campo-input:focus,
.campo-select:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.checkbox-custom {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
  padding: 0.5rem 0;
}

.checkbox-custom input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: #15803d;
  cursor: pointer;
}

.acoes-formulario {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.botao-principal {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #ffffff;
  background: #15803d;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.botao-principal:hover:not(:disabled) {
  background: #166534;
}

.botao-principal:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.botao-secundario {
  padding: 0.7rem 1.2rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.botao-secundario:hover {
  background: #e2e8f0;
}

.alerta-sucesso {
  padding: 0.75rem 1rem;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.alerta-erro {
  padding: 0.75rem 1rem;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

/* Tabela de Fontes */
.tabela-fontes {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  text-align: left;
}

.tabela-fontes th {
  background: #f8fafc;
  padding: 0.85rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-fontes td {
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}

.linha-fonte:hover {
  background: #fcfdfe;
}

.celula-fonte-principal {
  min-width: 240px;
}

.fonte-nome-linha {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.fonte-id {
  font-family: var(--fonte-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: #0284c7;
  background: #e0f2fe;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.fonte-nome {
  font-weight: 700;
  color: #0f172a;
}

.fonte-orgao-texto {
  font-size: 0.78rem;
  color: #64748b;
  margin-top: 0.2rem;
}

/* Informação de URL exposta */
.fonte-url-preview {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
  font-size: 0.74rem;
  color: #0369a1;
  background: #f0f9ff;
  border: 1px solid #e0f2fe;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  max-width: 320px;
}

.url-texto {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-modalidade {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  background: #f1f5f9;
  color: #334155;
  white-space: nowrap;
}

.modalidade--upload_manual {
  background: #fef3c7;
  color: #92400e;
}

.modalidade--api_rest {
  background: #e0f2fe;
  color: #0369a1;
}

.modalidade--download_url {
  background: #ede9fe;
  color: #5b21b6;
}

.badge-formato {
  font-family: var(--fonte-mono);
  font-size: 0.74rem;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.tag-geo-hint {
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.celula-ultima-execucao {
  min-width: 220px;
}

.data-execucao {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.82rem;
}

.linha-duracao {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.25rem;
}

.duracao-texto {
  font-size: 0.76rem;
  color: #64748b;
  font-weight: 600;
}

.container-erro-fonte {
  margin-top: 0.4rem;
  padding: 0.5rem 0.65rem;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 6px;
}

.mensagem-erro-texto {
  font-size: 0.76rem;
  color: #991b1b;
  word-break: break-word;
  line-height: 1.35;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mensagem-erro-texto.erro-expandido {
  display: block;
  overflow: visible;
}

.btn-toggle-erro {
  background: transparent;
  border: none;
  color: #e11d48;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.25rem 0 0;
  display: block;
}

.celula-data-add {
  white-space: nowrap;
  font-size: 0.8rem;
  color: #64748b;
}

.col-acoes-titulo {
  text-align: right;
}

.celula-acoes {
  text-align: right;
}

.grupo-botoes-acoes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.45rem;
}

.btn-acao-circulo {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.btn-acao-circulo svg {
  width: 1.05rem;
  height: 1.05rem;
}

.btn-editar {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #475569;
}

.btn-editar:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

.btn-mapeamento {
  background: #f0f9ff;
  border-color: #bae6fd;
  color: #0284c7;
}

.btn-mapeamento:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
}

.btn-executar {
  background: #15803d;
  color: #ffffff;
}

.btn-executar:hover:not(:disabled) {
  background: #166534;
}

.btn-executar:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-conjunto-dados {
  background: #faf5ff;
  border-color: #e9d5ff;
  color: #7e22ce;
}

.btn-conjunto-dados:hover {
  background: #f3e8ff;
  border-color: #c084fc;
}

.spinner-sm-branco {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
}

.spinner-grande {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e2e8f0;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
}

@keyframes girar {
  to { transform: rotate(360deg); }
}

/* Banner de Progresso e Resultados */
.linha-resultado td {
  padding: 0.5rem 1rem 1.25rem;
  background: #fbfcfe;
}

.banner-progresso {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.85rem 1.1rem;
}

.linha-fase {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  font-size: 0.85rem;
  color: #1e293b;
}

.tempo-decorrido {
  font-size: 0.78rem;
  color: #64748b;
  font-weight: normal;
}

.detalhe-fase {
  font-size: 0.78rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.trilho-progresso {
  margin-top: 0.5rem;
  height: 8px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.barra-preenchida {
  height: 100%;
  background: linear-gradient(90deg, #15803d, #22c55e);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.contagem-progresso {
  margin-top: 0.35rem;
  font-size: 0.76rem;
  color: #64748b;
}

.resultado-banner {
  padding: 0.85rem 1.15rem;
  border-radius: 8px;
  font-size: 0.86rem;
}

.resultado-banner--neutro {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.resultado-banner--alerta {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.resultado-banner--sucesso {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.resultado-banner--erro {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.resultado-alerta-corpo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.alerta-regra {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
}

.resultado-botoes-atalho {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-atalho {
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
  border: 1px solid transparent;
}

.btn-atalho--quarentena {
  background: #b45309;
  color: #ffffff;
}

.btn-atalho--quarentena:hover {
  background: #92400e;
}

.btn-atalho--pipeline {
  background: #ffffff;
  color: #334155;
  border-color: #cbd5e1;
}

.btn-atalho--pipeline:hover {
  background: #f1f5f9;
}

.estado-carregando,
.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
  gap: 0.6rem;
  text-align: center;
}

.estado-vazio svg {
  width: 2.5rem;
  height: 2.5rem;
  color: #94a3b8;
}

/* Responsividade Mobile e Tablet */
@media (max-width: 900px) {
  .formulario-grid {
    grid-template-columns: 1fr;
  }

  .campo-grupo--full {
    grid-column: span 1;
  }
}

@media (max-width: 640px) {
  .topo-pagina {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-recarregar {
    justify-content: center;
  }

  .cartao {
    padding: 1.1rem;
  }
}
/* ----- Cabeçalho: ações ----- */
.topo-acoes {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.btn-adicionar-fonte {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.1rem;
  background: #15803d;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-adicionar-fonte:hover {
  background: #166534;
}

.btn-adicionar-fonte svg {
  width: 18px;
  height: 18px;
}

/* ----- Modal do formulário ----- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding: 2rem 1rem;
  overflow-y: auto;
}

.modal-dialog {
  position: relative;
  width: 100%;
  max-width: 960px;
}

.modal-dialog .cartao {
  margin: 0;
}

.btn-fechar {
  position: absolute;
  top: 0.9rem;
  right: 1rem;
  background: transparent;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  z-index: 1;
}

.btn-fechar:hover {
  color: #0f172a;
}

.alerta-pagina {
  margin-bottom: 1.25rem;
}

.celula-agendamento {
  min-width: 150px;
}

.agendamento-texto {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
}

.agendamento-cron {
  display: inline-block;
  margin-top: 0.2rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.agendamento-vazio {
  font-size: 0.82rem;
  color: #94a3b8;
}

.btn-executar:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.linha-status-silver {
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
}

.badge-mapeamento-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.18rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.badge-mapeamento-status svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.badge-mapeamento--ok {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.badge-mapeamento--pendente {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.badge-mapeamento--sem-silver {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #cbd5e1;
}
/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .subtitulo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-recarregar {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .btn-recarregar:hover:not(:disabled) {
  background: var(--cor-borda);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .cartao {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .cartao-header {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .cartao-header-icone {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .cartao-titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .cartao-sub {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .campo-label {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo-input,
:root[data-tema="escuro"] .campo-select {
  border-color: var(--cor-borda-forte);
  background-color: var(--cor-superficie);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .campo-input:focus,
:root[data-tema="escuro"] .campo-select:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .checkbox-custom {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .checkbox-custom input {
  accent-color: var(--cor-link);
}

:root[data-tema="escuro"] .botao-principal {
  color: var(--cor-primaria-contraste);
  background: var(--cor-primaria);
}

:root[data-tema="escuro"] .botao-principal:hover:not(:disabled) {
  background: var(--cor-primaria-hover);
}

:root[data-tema="escuro"] .botao-secundario {
  color: var(--cor-texto-secundario);
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .botao-secundario:hover {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .alerta-sucesso {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .alerta-erro {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .tabela-fontes th {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-rotulo);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-fontes td {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .linha-fonte:hover {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .fonte-id {
  color: var(--cor-texto-rotulo);
  background: var(--cor-superficie-elevada);
  box-shadow: inset 0 0 0 1px var(--cor-borda);
}

:root[data-tema="escuro"] .fonte-nome {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .fonte-orgao-texto {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .fonte-url-preview {
  color: var(--cor-info);
  background: var(--tenue-info);
  border-color: rgb(124 180 247 / 30%);
}

:root[data-tema="escuro"] .badge-modalidade {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .modalidade--upload_manual {
  background: var(--tenue-alerta);
  color: var(--cor-alerta);
}

:root[data-tema="escuro"] .modalidade--api_rest {
  background: var(--tenue-info);
  color: var(--cor-info);
}

:root[data-tema="escuro"] .modalidade--download_url {
  background: var(--tenue-destaque);
  color: var(--cor-destaque);
}

:root[data-tema="escuro"] .badge-formato {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .tag-geo-hint {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .data-execucao {
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .duracao-texto {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .container-erro-fonte {
  background: var(--tenue-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .mensagem-erro-texto {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .btn-toggle-erro {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .celula-data-add {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-editar {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .btn-editar:hover {
  background: var(--cor-borda);
  color: var(--cor-texto-titulo);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-mapeamento {
  background: var(--tenue-info);
  border-color: rgb(124 180 247 / 30%);
  color: var(--cor-info);
}

:root[data-tema="escuro"] .btn-mapeamento:hover {
  background: var(--tenue-info);
  border-color: var(--cor-info);
}

:root[data-tema="escuro"] .btn-executar {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-executar:hover:not(:disabled) {
  background: var(--cor-primaria-hover);
}

:root[data-tema="escuro"] .btn-conjunto-dados {
  background: var(--tenue-destaque);
  border-color: rgb(180 156 251 / 30%);
  color: var(--cor-destaque);
}

:root[data-tema="escuro"] .btn-conjunto-dados:hover {
  background: var(--tenue-destaque);
  border-color: rgb(180 156 251 / 30%);
}

:root[data-tema="escuro"] .spinner-grande {
  border-color: var(--cor-borda);
  border-top-color: var(--cor-primaria);
}

:root[data-tema="escuro"] .linha-resultado td {
  background: var(--cor-superficie);
}

:root[data-tema="escuro"] .banner-progresso {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .linha-fase {
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .tempo-decorrido {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .detalhe-fase {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .trilho-progresso {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .barra-preenchida {
  background: linear-gradient(90deg, var(--cor-primaria), var(--cor-primaria));
}

:root[data-tema="escuro"] .contagem-progresso {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .resultado-banner--neutro {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .resultado-banner--alerta {
  background: var(--tenue-alerta);
  border-color: rgb(251 191 36 / 30%);
  color: var(--cor-alerta);
}

:root[data-tema="escuro"] .resultado-banner--sucesso {
  background: var(--cor-primaria-tenue);
  border-color: var(--cor-primaria-borda);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .resultado-banner--erro {
  background: var(--tenue-erro);
  border-color: rgb(248 113 113 / 30%);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .btn-atalho--quarentena {
  background: var(--cor-alerta);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-atalho--quarentena:hover {
  background: var(--cor-alerta);
}

:root[data-tema="escuro"] .btn-atalho--pipeline {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-atalho--pipeline:hover {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .estado-carregando,
:root[data-tema="escuro"] .estado-vazio {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .estado-vazio svg {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .btn-adicionar-fonte {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-adicionar-fonte:hover {
  background: var(--cor-primaria-hover);
}

:root[data-tema="escuro"] .btn-fechar {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .btn-fechar:hover {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .agendamento-texto {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .agendamento-cron {
  color: var(--cor-texto-terciario);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .agendamento-vazio {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .badge-mapeamento--ok {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .badge-mapeamento--pendente {
  background: var(--tenue-alerta);
  color: var(--cor-alerta);
  border-color: rgb(251 191 36 / 30%);
}

:root[data-tema="escuro"] .badge-mapeamento--sem-silver {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-terciario);
  border-color: var(--cor-borda-forte);
}
</style>
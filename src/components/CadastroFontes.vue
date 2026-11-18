<script setup>
import { reactive, ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { apiFetch } from '../services/http'
import { useRouter } from 'vue-router'
import ConstrutorCron from './ConstrutorCron.vue'
import ModalMapeamentoColunas from './ModalMapeamentoColunas.vue'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

const router = useRouter()

// Quem só visualiza fontes (ex.: Analista, Auditor) vê a lista sem os botões de alterar,
// executar ou enviar arquivo (LIZARDS-45); o backend barra com 403 de qualquer jeito.
const podeGerenciar = temPermissao(PERMISSOES.FONTE_GERENCIAR)
const podeVerDados = temPermissao(PERMISSOES.DADOS_VISUALIZAR)
const fonteParaMapeamento = ref(null)

const fontes = ref([])
const carregandoLista = ref(false)
const enviando = ref(false)
const erro = ref(null)
const sucesso = ref(false)

// --- ESTADOS DO PAINEL DE FILTROS (LIZARDS-40) ---
const painelFiltrosAberto = ref(true)
const termoBusca = ref('')
const filtroStatus = ref('')
const filtroModalidade = ref('')

function limparFiltros() {
  termoBusca.value = ''
  filtroStatus.value = ''
  filtroModalidade.value = ''
}

// Computada para filtrar a lista sem alterar o array 'fontes' original
const fontesFiltradas = computed(() => {
  if (!fontes.value || !Array.isArray(fontes.value)) return []

  return fontes.value.filter((fonte) => {
    // 1. Filtro por Status (Ativa / Inativa)
    let bateuStatus = true
    if (filtroStatus.value !== '') {
      const eAtivo = filtroStatus.value === 'true'
      bateuStatus = fonte.ativo === eAtivo
    }

    // 2. Filtro por Modalidade (UPLOAD_MANUAL, API_REST, DOWNLOAD_URL)
    let bateuModalidade = true
    if (filtroModalidade.value !== '') {
      bateuModalidade = fonte.tipoAquisicao === filtroModalidade.value
    }

    // 3. Busca por texto (varre Nome, Órgão, URL e Formato)
    let bateuTermo = true
    const termo = termoBusca.value.toLowerCase().trim()
    if (termo) {
      const textoCombinado = `${fonte.nome || ''} ${fonte.orgao || ''} ${fonte.urlOrigem || ''} ${fonte.formatoEsperado || ''}`.toLowerCase()
      bateuTermo = textoCombinado.includes(termo)
    }

    return bateuStatus && bateuModalidade && bateuTermo
  })
})

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

    <!-- PAINEL DE PESQUISA E FILTROS (TASK LIZARDS-40) -->
    <section class="card-pesquisa">
      <div class="header-pesquisa">
        <h3>Pesquisa e Filtros</h3>
        <button 
          type="button" 
          class="btn-recolher" 
          @click="painelFiltrosAberto = !painelFiltrosAberto"
        >
          {{ painelFiltrosAberto ? 'Recolher ▲' : 'Expandir ▼' }}
        </button>
      </div>

      <div v-show="painelFiltrosAberto" class="corpo-filtros">
        <!-- Filtro 1: Status -->
        <div class="grupo-campo">
          <label for="filtro-status">Filtrar por Status:</label>
          <select id="filtro-status" v-model="filtroStatus" class="input-select">
            <option value="">Todos os Status</option>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </div>

        <!-- Filtro 2: Modalidade -->
        <div class="grupo-campo">
          <label for="filtro-modalidade">Modalidade:</label>
          <select id="filtro-modalidade" v-model="filtroModalidade" class="input-select">
            <option value="">Todas as Modalidades</option>
            <option value="UPLOAD_MANUAL">Upload Manual</option>
            <option value="API_REST">API REST</option>
            <option value="DOWNLOAD_URL">Download URL</option>
          </select>
        </div>

        <!-- Filtro 3: Busca Textual -->
        <div class="grupo-campo busca-ampla">
          <label for="filtro-termo">Buscar Fonte, Órgão ou URL:</label>
          <div class="input-com-icone">
            <input
              id="filtro-termo"
              v-model="termoBusca"
              type="text"
              class="input-texto"
              placeholder="Ex: IBAMA, GEOJSON, http..."
            />
          </div>
        </div>

        <!-- Limpar Filtros -->
        <div v-if="termoBusca || filtroStatus !== '' || filtroModalidade !== ''" class="grupo-campo acoes">
          <button type="button" class="btn-limpar" @click="limparFiltros">
            Limpar Filtros
          </button>
        </div>
      </div>
    </section>

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
              <div class="campo-label">
                Agendamento Automático de Execução
                <ConstrutorCron
                  v-model="form.cronExpressao"
                  v-model:completo="agendamentoCompleto"
                  :bloqueado="form.tipoAquisicao === 'UPLOAD_MANUAL'"
                  motivo-bloqueio="Fonte de upload manual não tem atualização automática: os dados mudam quando um arquivo novo é enviado."
                />
              </div>
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
          <h2 class="cartao-titulo">Fontes Cadastradas ({{ fontesFiltradas.length }})</h2>
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

      <div v-else-if="!fontesFiltradas.length" class="estado-vazio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <p>Nenhuma fonte encontrada para os parâmetros informados.</p>
        <small>Tente alterar ou limpar os campos do painel de pesquisa acima.</small>
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
            <template v-for="fonte in fontesFiltradas" :key="fonte.id">
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
                  <!-- Indicador de Status do Mapeamento Silver -->
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

                <!-- Agendamento automático -->
                <td class="celula-agendamento">
                  <template v-if="fonte.cronExpressao">
                    <div class="agendamento-texto">{{ descreverCron(fonte.cronExpressao) }}</div>
                    <code class="agendamento-cron">{{ fonte.cronExpressao }}</code>
                    <div v-if="!fonte.ativo" class="agendamento-pausado">Pausado: fonte inativa</div>
                  </template>
                  <span v-else-if="fonte.tipoAquisicao === 'UPLOAD_MANUAL'" class="agendamento-vazio">Por envio de arquivo</span>
                  <span v-else class="agendamento-vazio">Sem agendamento</span>
                </td>

                <!-- Última Execução -->
                <td class="celula-ultima-execucao">
                  <div class="data-execucao">{{ formatarData(fonte.ultimaExecucaoEm) }}</div>

                  <div v-if="fonte.ultimaDuracaoMs != null" class="linha-duracao">
                    <span class="duracao-texto">{{ formatarDuracao(fonte.ultimaDuracaoMs) }}</span>
                    <span class="badge-tag" :class="fonte.ultimoStatusExecucao === 'ERRO' ? 'badge-tag--erro' : 'badge-tag--sucesso'">
                      {{ fonte.ultimoStatusExecucao === 'ERRO' ? 'Falha' : 'OK' }}
                    </span>
                  </div>

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

<style scoped src="../styles/views/CadastroFontes.css"></style>

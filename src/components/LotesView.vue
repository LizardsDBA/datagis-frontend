<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { buscarLotes, liberarLote, descartarLote, obterProgressoLote } from '../services/loteService'
import { publicarGold, obterStatusGold } from '../services/goldService'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Acoes de governanca do lote so pra quem pode (LIZARDS-45); o backend barra com 403 de qualquer jeito
const podeGerenciarLote = temPermissao(PERMISSOES.LOTE_GERENCIAR)
const podeVerQuarentena = temPermissao(PERMISSOES.QUARENTENA_VISUALIZAR)
const podePublicarGold = temPermissao(PERMISSOES.INDICADOR_PUBLICAR)

const router = useRouter()

const lotes = ref([])
const carregando = ref(false)
const erro = ref(null)
const sucesso = ref(null)

// Filtros
const filtroStatus = ref('TODOS')
const filtroBusca = ref('')

// Controles de Acordeão (Progressive Disclosure)
const filtrosExpandidos = ref(true)
const tabelaExpandida = ref(true)

function alternarFiltros() {
  filtrosExpandidos.value = !filtrosExpandidos.value
}

function alternarTabela() {
  tabelaExpandida.value = !tabelaExpandida.value
}

// Modal de Descarte de Lote
const loteParaDescartar = ref(null)
const motivoDescarte = ref('')
const processandoAcao = ref(false)

async function carregarLotes() {
  carregando.value = true
  erro.value = null
  try {
    lotes.value = await buscarLotes()
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar lotes de ingestão'
  } finally {
    carregando.value = false
  }
}

const lotesFiltrados = computed(() => {
  return lotes.value.filter(l => {
    if (filtroStatus.value !== 'TODOS' && l.status !== filtroStatus.value) {
      return false
    }
    if (filtroBusca.value.trim()) {
      const termo = filtroBusca.value.toLowerCase()
      const matchId = String(l.id).includes(termo)
      const matchFonte = (l.fonteDadoNome || '').toLowerCase().includes(termo)
      const matchOrigem = (l.origemReferencia || '').toLowerCase().includes(termo)
      return matchId || matchFonte || matchOrigem
    }
    return true
  })
})

const metricas = computed(() => {
  const total = lotes.value.length
  const migradosGold = lotes.value.filter(l => l.status === 'PROMOVIDO_GOLD').length
  const promovidos = lotes.value.filter(l => l.status === 'PROMOVIDO_SILVER').length
  const retidos = lotes.value.filter(l => l.status === 'RETIDO_QUARENTENA').length
  const descartados = lotes.value.filter(l => l.status === 'DESCARTADO').length
  const semMudanca = lotes.value.filter(l => l.status === 'SEM_MUDANCA').length
  return { total, migradosGold, promovidos, retidos, descartados, semMudanca }
})

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function verNaQuarentena(loteId) {
  router.push({ path: '/quarentena', query: { loteId } })
}

// Modal de Liberação de Lote com Barra de Progresso
const loteParaLiberar = ref(null)
const faseLiberacao = ref('CONFIRMACAO') // 'CONFIRMACAO' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO'
const progressoPercentual = ref(0)
const etapaAtual = ref(1)
const mensagemErroLiberacao = ref('')
let timerProgresso = null

function abrirModalLiberacao(lote) {
  loteParaLiberar.value = lote
  faseLiberacao.value = 'CONFIRMACAO'
  progressoPercentual.value = 0
  etapaAtual.value = 1
  mensagemErroLiberacao.value = ''
  erro.value = null
}

function fecharModalLiberacao() {
  if (faseLiberacao.value === 'PROCESSANDO') return
  if (timerProgresso) {
    clearInterval(timerProgresso)
    timerProgresso = null
  }
  sessionStorage.removeItem('datagis_lote_liberando_id')
  loteParaLiberar.value = null
  faseLiberacao.value = 'CONFIRMACAO'
  progressoPercentual.value = 0
  etapaAtual.value = 1
}

function irParaQuarentenaLote() {
  const loteId = loteParaLiberar.value?.id
  fecharModalLiberacao()
  if (loteId) {
    verNaQuarentena(loteId)
  } else {
    router.push('/quarentena')
  }
}

async function confirmarLiberacao() {
  if (!loteParaLiberar.value) return

  faseLiberacao.value = 'PROCESSANDO'
  progressoPercentual.value = 10
  etapaAtual.value = 1
  mensagemErroLiberacao.value = ''

  if (timerProgresso) {
    clearInterval(timerProgresso)
    timerProgresso = null
  }

  const loteIdAlvo = loteParaLiberar.value.id
  sessionStorage.setItem('datagis_lote_liberando_id', String(loteIdAlvo))

  try {
    const resposta = await liberarLote(loteIdAlvo)

    if (resposta?.statusFinal === 'PROMOVIDO_SILVER' || resposta?.fase === 'CONCLUIDO') {
      finalizarLiberacaoSucesso(loteIdAlvo)
      return
    }

    iniciarPollingLiberacao(loteIdAlvo)
  } catch (e) {
    sessionStorage.removeItem('datagis_lote_liberando_id')
    if (timerProgresso) {
      clearInterval(timerProgresso)
      timerProgresso = null
    }
    faseLiberacao.value = 'ERRO'
    mensagemErroLiberacao.value = e.message || 'Não foi possível enviar o lote para a Silver.'
    carregarLotes()
  }
}

function finalizarLiberacaoSucesso(loteIdAlvo) {
  if (timerProgresso) {
    clearInterval(timerProgresso)
    timerProgresso = null
  }
  sessionStorage.removeItem('datagis_lote_liberando_id')
  progressoPercentual.value = 100
  etapaAtual.value = 4
  faseLiberacao.value = 'SUCESSO'

  const item = lotes.value.find(l => l.id === loteIdAlvo)
  if (item) {
    item.status = 'PROMOVIDO_SILVER'
  }
  sucesso.value = `Pronto! O lote #${loteIdAlvo} foi para a Silver.`

  carregarLotes()

  setTimeout(() => {
    if (faseLiberacao.value === 'SUCESSO' && loteParaLiberar.value?.id === loteIdAlvo) {
      fecharModalLiberacao()
    }
  }, 1800)
}

function iniciarPollingLiberacao(loteIdAlvo) {
  if (timerProgresso) {
    clearInterval(timerProgresso)
    timerProgresso = null
  }

  timerProgresso = setInterval(async () => {
    try {
      const prog = await obterProgressoLote(loteIdAlvo)
      if (!prog) return

      if (prog.percentual > 0) {
        progressoPercentual.value = Math.max(progressoPercentual.value, prog.percentual)
      }

      if (prog.fase === 'REVALIDANDO_QUARENTENA' || prog.fase === 'INICIANDO') {
        etapaAtual.value = 1
      } else if (prog.fase === 'CARREGANDO_BRONZE' || prog.fase === 'EXECUTANDO_REGRAS') {
        etapaAtual.value = 2
      } else if (prog.fase === 'PERSISTINDO_SILVER') {
        etapaAtual.value = 3
      }

      if (prog.statusFinal === 'PROMOVIDO_SILVER' || prog.fase === 'CONCLUIDO') {
        finalizarLiberacaoSucesso(loteIdAlvo)
      } else if (prog.statusFinal === 'RETIDO_QUARENTENA' || prog.fase === 'CONCLUIDO_COM_ERROS' || prog.fase === 'FALHA') {
        if (timerProgresso) {
          clearInterval(timerProgresso)
          timerProgresso = null
        }
        sessionStorage.removeItem('datagis_lote_liberando_id')
        faseLiberacao.value = 'ERRO'
        mensagemErroLiberacao.value = prog.detalhe || 'O lote contém inconsistências e permaneceu retido na Quarentena.'
        carregarLotes()
      }
    } catch (e) {
      // Falha temporária de rede durante polling
    }
  }, 1000)
}

function abrirModalDescarte(lote) {
  loteParaDescartar.value = lote
  motivoDescarte.value = ''
  erro.value = null
}

function fecharModalDescarte() {
  loteParaDescartar.value = null
  motivoDescarte.value = ''
}

async function confirmarDescarte() {
  if (!motivoDescarte.value.trim()) {
    erro.value = 'Informe a justificativa do descarte do lote.'
    return
  }

  processandoAcao.value = true
  erro.value = null
  sucesso.value = null

  try {
    await descartarLote(loteParaDescartar.value.id, motivoDescarte.value.trim())
    sucesso.value = `Lote #${loteParaDescartar.value.id} descartado com sucesso. Nenhum registro foi para a Silver.`
    fecharModalDescarte()
    await carregarLotes()
  } catch (e) {
    erro.value = e.message || 'Falha ao descartar lote.'
  } finally {
    processandoAcao.value = false
  }
}

const lotesNaSilver = computed(() => lotes.value.filter(l => l.status === 'PROMOVIDO_SILVER'))

// Modal de Migração Silver -> Gold
const modalGoldAberto = ref(false)
const faseGold = ref('CONFIRMACAO') // 'CONFIRMACAO' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO'
const statusGold = ref(null)
const resultadoPublicacaoTudo = ref(null)
const erroGold = ref('')
let timerPollingGold = null

async function abrirModalGold() {
  if (lotesNaSilver.value.length === 0) {
    erro.value = 'Nenhum lote com status PROMOVIDO_SILVER disponível para migração para a Gold.'
    return
  }

  try {
    const status = await obterStatusGold()
    statusGold.value = status
    if (status?.algumEmAndamento) {
      faseGold.value = 'PROCESSANDO'
      modalGoldAberto.value = true
      iniciarPollingGold()
      return
    }
  } catch (e) {
    // ignora falha inicial de status
  }

  faseGold.value = 'CONFIRMACAO'
  resultadoPublicacaoTudo.value = null
  erroGold.value = ''
  modalGoldAberto.value = true
}

function fecharModalGold() {
  if (faseGold.value === 'PROCESSANDO') return
  if (timerPollingGold) {
    clearInterval(timerPollingGold)
    timerPollingGold = null
  }
  modalGoldAberto.value = false
}

// X da fase de processamento: só esconde a janela. A publicação segue no backend e o
// acompanhamento (polling) continua, então a lista de lotes atualiza sozinha ao terminar;
// o painel de Processamentos mostra o andamento e o botão "Migrar para Gold" reabre esta tela.
function ocultarModalGold() {
  modalGoldAberto.value = false
}

function iniciarPollingGold() {
  if (timerPollingGold) {
    clearInterval(timerPollingGold)
    timerPollingGold = null
  }

  timerPollingGold = setInterval(async () => {
    try {
      const status = await obterStatusGold()
      statusGold.value = status

      const emAndamento = status?.algumEmAndamento ?? (status?.indicadores?.status === 'EM_ANDAMENTO')
      if (!emAndamento) {
        if (timerPollingGold) {
          clearInterval(timerPollingGold)
          timerPollingGold = null
        }

        if (status?.indicadores?.status === 'FALHOU') {
          faseGold.value = 'ERRO'
          erroGold.value = status?.indicadores?.mensagemErro || 'Falha ao executar a migração para a camada Gold.'
        } else {
          faseGold.value = 'SUCESSO'
          sucesso.value = 'Pronto! A migração para a camada Gold foi concluída e os dados foram consolidados com sucesso.'
          await carregarLotes()
        }
      }
    } catch (e) {
      // ignora falhas intermediárias de polling
    }
  }, 2000)
}

async function confirmarPublicacaoGold() {
  faseGold.value = 'PROCESSANDO'
  erroGold.value = ''

  try {
    const res = await publicarGold()
    statusGold.value = res
    if (res?.totalImoveis !== undefined) {
      resultadoPublicacaoTudo.value = res
    }

    if (res && (res.totalImoveis !== undefined || (res.algumEmAndamento === false && res.indicadores?.status === 'CONCLUIDA'))) {
      faseGold.value = 'SUCESSO'
      sucesso.value = 'Pronto! A migração para a camada Gold foi concluída e os dados foram consolidados com sucesso.'
      await carregarLotes()
      return
    }
  } catch (e) {
    faseGold.value = 'ERRO'
    erroGold.value = e.message || 'Falha ao iniciar a migração para a camada Gold.'
    return
  }

  iniciarPollingGold()
}

async function verificarStatusGoldAtivo() {
  try {
    const status = await obterStatusGold()
    if (status?.algumEmAndamento) {
      statusGold.value = status
      faseGold.value = 'PROCESSANDO'
      modalGoldAberto.value = true
      iniciarPollingGold()
    }
  } catch (e) {
    // ignora falhas transitórias de verificação inicial
  }
}

async function verificarLoteLiberandoAtivo() {
  const loteIdSalvo = sessionStorage.getItem('datagis_lote_liberando_id')
  if (!loteIdSalvo) return

  try {
    const idNum = Number(loteIdSalvo)
    const prog = await obterProgressoLote(idNum)
    if (prog && prog.fase !== 'OCIOSO' && !prog.concluidoEm) {
      const loteObj = lotes.value.find(l => l.id === idNum) || { id: idNum, fonteDadoNome: `Lote #${idNum}` }
      loteParaLiberar.value = loteObj
      faseLiberacao.value = 'PROCESSANDO'
      progressoPercentual.value = prog.percentual || 10
      if (prog.fase === 'PERSISTINDO_SILVER') etapaAtual.value = 3
      else if (prog.fase === 'CARREGANDO_BRONZE' || prog.fase === 'EXECUTANDO_REGRAS') etapaAtual.value = 2
      else etapaAtual.value = 1
      iniciarPollingLiberacao(idNum)
    } else {
      sessionStorage.removeItem('datagis_lote_liberando_id')
    }
  } catch (e) {
    sessionStorage.removeItem('datagis_lote_liberando_id')
  }
}

onMounted(async () => {
  await carregarLotes()
  await verificarStatusGoldAtivo()
  await verificarLoteLiberandoAtivo()
})

onUnmounted(() => {
  if (timerPollingGold) {
    clearInterval(timerPollingGold)
    timerPollingGold = null
  }
  if (timerProgresso) {
    clearInterval(timerProgresso)
    timerProgresso = null
  }
})
</script>


<template>
  <div class="pagina-lotes">
    <!-- Cabeçalho Principal -->
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">PIPELINE e TRANSIÇÃO</p>
        <h1 class="titulo">Lotes de Ingestão e Pipeline</h1>
        <p class="subtitulo">
          Monitoramento do fluxo Bronze → Silver e governança da integridade total (All-or-Nothing).
        </p>
      </div>

      <div class="acoes-topo">
        <button
          v-if="podePublicarGold"
          class="btn-migrar-gold"
          :disabled="carregando || lotesNaSilver.length === 0 || (faseGold === 'PROCESSANDO' && modalGoldAberto)"
          @click="abrirModalGold"
          title="Migrar dados consolidados da Silver para a Gold"
        >
          <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>Migrar para Gold</span>
          <span v-if="lotesNaSilver.length > 0" class="badge-contador-gold">{{ lotesNaSilver.length }} na Silver</span>
        </button>

        <button class="btn-atualizar" @click="carregarLotes" :disabled="carregando" title="Recarregar lotes de ingestão">
          <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          <span>Atualizar</span>
        </button>
      </div>
    </header>

    <!-- Grid de Métricas Responsivo e Alinhado (6 KPIs) -->
    <section class="grid-metricas">
      <div class="card-metrica">
        <span class="metrica-label">Total de Lotes</span>
        <span class="metrica-valor">{{ metricas.total }}</span>
        <span class="metrica-sub">Execuções de ingestão</span>
      </div>

      <div class="card-metrica card-metrica--gold">
        <span class="metrica-label">Migrados para Gold</span>
        <span class="metrica-valor">{{ metricas.migradosGold }}</span>
        <span class="metrica-sub">Publicados no mapa</span>
      </div>

      <div class="card-metrica card-metrica--promovido">
        <span class="metrica-label">Promovidos para Silver</span>
        <span class="metrica-valor">{{ metricas.promovidos }}</span>
        <span class="metrica-sub">100% íntegros e persistidos</span>
      </div>

      <div class="card-metrica card-metrica--retido">
        <span class="metrica-label">Retidos na Quarentena</span>
        <span class="metrica-valor">{{ metricas.retidos }}</span>
        <span class="metrica-sub">Pausados aguardando analista</span>
      </div>

      <div class="card-metrica card-metrica--descartado">
        <span class="metrica-label">Descartados</span>
        <span class="metrica-valor">{{ metricas.descartados }}</span>
        <span class="metrica-sub">Rejeitados pelo operador</span>
      </div>

      <div class="card-metrica card-metrica--neutro">
        <span class="metrica-label">Sem Alterações</span>
        <span class="metrica-valor">{{ metricas.semMudanca }}</span>
        <span class="metrica-sub">Hash de dados inalterado</span>
      </div>
    </section>

    <!-- Alertas Globais -->
    <div v-if="erro" class="alerta alerta--erro">
      <span>✕ {{ erro }}</span>
    </div>
    <div v-if="sucesso" class="alerta alerta--sucesso">
      <span>✓ {{ sucesso }}</span>
    </div>

    <!-- Seção de Filtros (Acordeão) -->
    <div class="card-secao">
      <div class="card-header" @click="alternarFiltros" role="button">
        <div class="header-titulos">
          <h3 class="diagnostico-titulo">Pesquisa e Filtros</h3>
        </div>
        <button type="button" class="btn-toggle-acordeao">
          <span>{{ tabelaExpandida ? 'Recolher' : 'Expandir' }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'icone-rotacionado': !filtrosExpandidos }">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
      
      <div v-show="filtrosExpandidos" class="corpo-secao">
        <section class="barra-filtros">
          <div class="grupo-campo">
            <label class="rotulo-filtro">Filtrar por Status:</label>
            <select v-model="filtroStatus" class="select-filtro">
              <option value="TODOS">Todos os Status</option>
              <option value="PROMOVIDO_GOLD">Migrado para Gold</option>
              <option value="PROMOVIDO_SILVER">Promovido para Silver</option>
              <option value="RETIDO_QUARENTENA">Retido na Quarentena</option>
              <option value="DESCARTADO">Descartado</option>
              <option value="SEM_MUDANCA">Sem Alteração</option>
            </select>
          </div>

          <div class="grupo-campo grupo-campo--busca">
            <label class="rotulo-filtro">Buscar Lote, Fonte ou Arquivo:</label>
            <div class="input-busca-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icone-busca">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                v-model="filtroBusca"
                type="text"
                placeholder="Ex: #12, IBAMA, imoveis.zip..."
                class="input-busca"
              />
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Seção da Tabela (Acordeão) -->
    <div class="card-secao">
      <div class="card-header" @click="alternarTabela" role="button">
        <div class="header-titulos">
          <h3 class="diagnostico-titulo">Histórico de Transições</h3>
        </div>
        <button type="button" class="btn-toggle-acordeao">
          <span>{{ tabelaExpandida ? 'Recolher Tabela' : 'Expandir Tabela' }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'icone-rotacionado': !tabelaExpandida }">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
      
      <div v-show="tabelaExpandida" class="corpo-secao">
        <section class="tabela-container">
          <div v-if="carregando" class="estado-carregando">
            <div class="spinner"></div>
            <span>Carregando histórico de lotes e transições...</span>
          </div>

          <div v-else-if="lotesFiltrados.length === 0" class="estado-vazio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <h3>Nenhum lote encontrado</h3>
            <p>Nenhuma execução corresponde aos filtros aplicados.</p>
          </div>

          <div v-else class="tabela-responsiva-wrapper">
            <table class="tabela-dados">
              <thead>
                <tr>
                  <th class="col-id">Lote ID</th>
                  <th>Fonte de Origem e Arquivo</th>
                  <th>Registros</th>
                  <th>Data de Execução</th>
                  <th>Status da Transição</th>
                  <th class="col-acao-th">Ações do Pipeline</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lote in lotesFiltrados" :key="lote.id" class="linha-tabela">
                  <!-- Lote ID -->
                  <td class="col-id">
                    <span class="badge-lote-id">#{{ lote.id }}</span>
                  </td>

                  <!-- Fonte de Dados + Origem / Referência exposta -->
                  <td class="col-fonte">
                    <div class="fonte-nome">{{ lote.fonteDadoNome }}</div>
                    <div class="fonte-sub-info">
                      <span class="texto-apagado">Fonte #{{ lote.fonteDadoId }}</span>
                      <div v-if="lote.origemReferencia" class="origem-ref-badge" :title="lote.origemReferencia">
                        <span class="origem-texto">{{ lote.origemReferencia }}</span>
                      </div>
                    </div>
                  </td>

                  <!-- Quantidade de Registros -->
                  <td class="col-registros">
                    <strong class="valor-registros">{{ (lote.quantidadeRegistros || 0).toLocaleString('pt-BR') }}</strong>
                    <span class="sub-rotulo">linhas</span>
                  </td>

                  <!-- Data de Execução -->
                  <td class="col-data">
                    {{ formatarData(lote.dataExecucao) }}
                  </td>

                  <!-- Status com Badges e Regra All-or-Nothing -->
                  <td class="col-status">
                    <div class="status-wrapper">
                      <span
                        class="badge-status"
                        :class="{
                          'badge--gold': lote.status === 'PROMOVIDO_GOLD',
                          'badge--promovido': lote.status === 'PROMOVIDO_SILVER',
                          'badge--retido': lote.status === 'RETIDO_QUARENTENA' && !(loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO'),
                          'badge--processando': loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO',
                          'badge--descartado': lote.status === 'DESCARTADO',
                          'badge--neutro': lote.status === 'SEM_MUDANCA' || !lote.status,
                        }"
                      >
                        <template v-if="loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO'">
                          <span class="spinner-dot"></span> Promovendo para Silver...
                        </template>
                        <template v-else>
                          {{
                            lote.status === 'PROMOVIDO_GOLD' ? 'Migrado para Gold' :
                            lote.status === 'PROMOVIDO_SILVER' ? 'Promovido para Silver' :
                            lote.status === 'RETIDO_QUARENTENA' ? 'Retido na Quarentena' :
                            lote.status === 'DESCARTADO' ? 'Descartado' :
                            lote.status === 'SEM_MUDANCA' ? 'Sem Mudança' : lote.status
                          }}
                        </template>
                      </span>

                      <span v-if="lote.status === 'PROMOVIDO_GOLD'" class="regra-aviso regra-aviso--gold">
                        Publicado e consolidado na Gold
                      </span>
                      <span v-else-if="lote.status === 'RETIDO_QUARENTENA' && !(loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO')" class="regra-aviso">
                        Integridade lote: 0 registros em Silver
                      </span>
                      <span v-else-if="loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO'" class="regra-aviso texto-azul">
                        Gravando registros atômicos na Silver...
                      </span>
                    </div>
                  </td>

                  <!-- Ações -->
                  <td class="col-acao-td">
                    <div v-if="lote.status === 'RETIDO_QUARENTENA'" class="acoes-retido">
                      <template v-if="loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO'">
                        <button class="btn-acao btn-liberar btn--em-progresso" disabled>
                          <span class="spinner-pequeno"></span> Promovendo ({{ progressoPercentual }}%)...
                        </button>
                      </template>
                      <template v-else>
                        <button
                          v-if="podeVerQuarentena"
                          class="btn-acao btn-ver-erros"
                          title="Inspecionar inconsistências deste lote na Quarentena"
                          @click="verNaQuarentena(lote.id)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>Inspecionar Erros</span>
                        </button>
                        <button
                          v-if="podeGerenciarLote"
                          class="btn-acao btn-liberar"
                          title="Liberar lote para Silver após validação do analista"
                          :disabled="processandoAcao || faseLiberacao === 'PROCESSANDO'"
                          @click="abrirModalLiberacao(lote)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                          <span>Liberar para Silver</span>
                        </button>
                        <button
                          v-if="podeGerenciarLote"
                          class="btn-acao btn-descartar"
                          title="Descartar lote e não promover nenhum registro"
                          :disabled="processandoAcao || faseLiberacao === 'PROCESSANDO'"
                          @click="abrirModalDescarte(lote)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>Descartar</span>
                        </button>
                      </template>
                    </div>

                    <div v-else-if="lote.status === 'PROMOVIDO_GOLD'" class="texto-concluido texto-concluido--gold">
                      <span class="icone-check icone-check--gold">✓</span>
                      <span>Publicado na Gold</span>
                    </div>

                    <div v-else-if="lote.status === 'PROMOVIDO_SILVER'" class="texto-concluido">
                      <span class="icone-check">✓</span>
                      <span>Disponível na Silver</span>
                    </div>

                    <span v-else class="texto-apagado">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- Modais omitidos no <template> aqui para não repetir 300 linhas idênticas, 
         o código dos modais (Liberação e Descarte) continua INTACTO abaixo das sections -->
         
    <!-- Modal de Liberação de Lote -->
    <div v-if="loteParaLiberar" class="modal-backdrop" @click.self="fecharModalLiberacao">
      <div class="modal-dialog modal-dialog--liberacao">
        
        <!-- Fase 1: Confirmação -->
        <template v-if="faseLiberacao === 'CONFIRMACAO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-verde">ENVIAR PARA A SILVER</span>
              <h2 class="modal-titulo">Enviar o lote #{{ loteParaLiberar.id }} para a Silver?</h2>
              <p class="modal-sub">
                Fonte: <strong>{{ loteParaLiberar.fonteDadoNome }}</strong> ({{ (loteParaLiberar.quantidadeRegistros || 0).toLocaleString('pt-BR') }} registros)
              </p>
            </div>
            <button class="btn-fechar" @click="fecharModalLiberacao">✕</button>
          </header>

          <div class="modal-body">
            <div class="card-info-liberacao">
              <div class="icone-info-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="info-texto">
                <h4>Revalidação Completa do Lote</h4>
                <p>
                  Ao liberar, todos os registros do lote passarão por uma nova revalidação. Os registros válidos e já corrigidos serão enviados à Silver se 100% dos dados estiverem em conformidade.
                </p>
                <p class="destaque-quarentena destaque-quarentena--aviso">
                  Atenção: Se algum item ainda contiver erro, a liberação será bloqueada e as inconsistências permanecerão retidas na Quarentena.
                </p>
              </div>
            </div>

            <div class="resumo-lote">
              <div class="resumo-item">
                <span class="resumo-rotulo">Lote ID</span>
                <span class="resumo-valor">#{{ loteParaLiberar.id }}</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Total de Registros</span>
                <span class="resumo-valor">{{ (loteParaLiberar.quantidadeRegistros || 0).toLocaleString('pt-BR') }}</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Status Atual</span>
                <span class="badge-status badge--retido">Retido na Quarentena</span>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-cancelar" @click="fecharModalLiberacao">Cancelar</button>
            <button class="btn-confirmar-liberar" @click="confirmarLiberacao">
              Enviar para a Silver
            </button>
          </footer>
        </template>

        <!-- Fase 2: Processando com Barra de Progresso e Stepper -->
        <template v-else-if="faseLiberacao === 'PROCESSANDO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-azul">ENVIANDO</span>
              <h2 class="modal-titulo">Enviando o lote #{{ loteParaLiberar.id }}...</h2>
              <p class="modal-sub">
                Isso pode levar alguns segundos.
              </p>
            </div>
          </header>

          <div class="modal-body">
            <!-- Barra de Progresso Animada -->
            <div class="progresso-wrapper">
              <div class="progresso-topo">
                <span class="progresso-label">Progresso</span>
                <span class="progresso-porcentagem">{{ progressoPercentual }}%</span>
              </div>
              <div class="barra-trilho">
                <div class="barra-preenchimento" :style="{ width: progressoPercentual + '%' }">
                  <div class="barra-brilho"></div>
                </div>
              </div>
            </div>

            <!-- Stepper de Etapas -->
            <div class="stepper-pipeline">
              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 1, 'step-concluido': etapaAtual > 1 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 1">✓</span>
                  <div v-else-if="etapaAtual === 1" class="step-spinner"></div>
                  <span v-else>1</span>
                </div>
                <div class="step-conteudo">
                  <h5>Conferindo os dados</h5>
                  <p>Checando regras e removendo registros repetidos</p>
                </div>
              </div>

              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 2, 'step-concluido': etapaAtual > 2 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 2">✓</span>
                  <div v-else-if="etapaAtual === 2" class="step-spinner"></div>
                  <span v-else>2</span>
                </div>
                <div class="step-conteudo">
                  <h5>Preparando os mapas</h5>
                  <p>Ajustando as geometrias dos imóveis</p>
                </div>
              </div>

              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 3, 'step-concluido': etapaAtual > 3 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 3">✓</span>
                  <div v-else-if="etapaAtual === 3" class="step-spinner"></div>
                  <span v-else>3</span>
                </div>
                <div class="step-conteudo">
                  <h5>Salvando na Silver</h5>
                  <p>Gravando os registros aprovados</p>
                </div>
              </div>

              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 4, 'step-concluido': etapaAtual >= 4 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual >= 4">✓</span>
                  <div v-else class="step-circulo-vazio">4</div>
                </div>
                <div class="step-conteudo">
                  <h5>Finalizando</h5>
                  <p>Atualizando o status do lote</p>
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <span class="texto-aviso-processando">
              <span class="spinner-pequeno"></span> Quase lá, não feche esta janela...
            </span>
          </footer>
        </template>

        <!-- Fase 3: Sucesso -->
        <template v-else-if="faseLiberacao === 'SUCESSO'">
          <header class="modal-header modal-header--sucesso">
            <div>
              <span class="modal-etiqueta etiqueta-verde">ENVIO CONCLUÍDO</span>
              <h2 class="modal-titulo">Pronto! O lote #{{ loteParaLiberar.id }} está na Silver</h2>
            </div>
            <button class="btn-fechar" @click="fecharModalLiberacao">✕</button>
          </header>

          <div class="modal-body modal-body--centro">
            <div class="icone-sucesso-animado">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Dados disponíveis na Silver</h3>
            <p class="sub-sucesso">
              Os registros já podem ser usados nos cruzamentos e indicadores.
            </p>
            <div class="barra-trilho">
              <div class="barra-preenchimento barra--100"></div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-concluir" @click="fecharModalLiberacao">
              Concluir
            </button>
          </footer>
        </template>

        <!-- Fase 4: Erro -->
        <template v-else-if="faseLiberacao === 'ERRO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-vermelha">LIBERAÇÃO BLOQUEADA</span>
              <h2 class="modal-titulo">Lote #{{ loteParaLiberar.id }} Retido na Quarentena</h2>
            </div>
            <button class="btn-fechar" @click="fecharModalLiberacao">✕</button>
          </header>

          <div class="modal-body">
            <div class="aviso-descarte">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <div>
                <strong>A liberação para a Silver não pôde ser concluída:</strong>
                <p>{{ mensagemErroLiberacao }}</p>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-cancelar" @click="fecharModalLiberacao">Fechar</button>
            <button
              v-if="podeVerQuarentena"
              class="btn-atalho-quarentena"
              @click="irParaQuarentenaLote"
            >
              Inspecionar na Quarentena →
            </button>
          </footer>
        </template>

      </div>
    </div>

    <!-- Modal de Descarte de Lote -->
    <div v-if="loteParaDescartar" class="modal-backdrop" @click.self="fecharModalDescarte">
      <div class="modal-dialog">
        <header class="modal-header">
          <div>
            <span class="modal-etiqueta etiqueta-vermelha">REJEIÇÃO DE LOTE</span>
            <h2 class="modal-titulo">Descartar Lote #{{ loteParaDescartar.id }}</h2>
            <p class="modal-sub">
              Fonte: {{ loteParaDescartar.fonteDadoNome }} ({{ loteParaDescartar.quantidadeRegistros }} registros)
            </p>
          </div>
          <button class="btn-fechar" @click="fecharModalDescarte">✕</button>
        </header>

        <div class="modal-body">
          <div class="aviso-descarte">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <strong>Atenção: Ação Irreversível</strong>
              <p>Ao descartar este lote, <strong>nenhum registro será gravado na Silver</strong> e o lote será marcado como DESCARTADO.</p>
            </div>
          </div>

          <div class="campo-motivo">
            <label class="rotulo-motivo">Justificativa do Descarte *</label>
            <textarea
              v-model="motivoDescarte"
              rows="4"
              placeholder="Descreva o motivo da rejeição do lote (ex: arquivo corrompido, coordenadas inválidas recorrentes, base desatualizada)..."
              required
              class="textarea-motivo"
            ></textarea>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn-cancelar" @click="fecharModalDescarte">Cancelar</button>
          <button class="btn-confirmar-descarte" :disabled="processandoAcao" @click="confirmarDescarte">
            {{ processandoAcao ? 'Descartando...' : 'Confirmar Descarte' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Modal de Migração Silver -> Gold -->
    <div v-if="modalGoldAberto" class="modal-backdrop" @click.self="fecharModalGold">
      <div class="modal-dialog modal-dialog--gold">
        
        <!-- Fase 1: Confirmação -->
        <template v-if="faseGold === 'CONFIRMACAO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-gold">TRANSIÇÃO SILVER → GOLD</span>
              <h2 class="modal-titulo">
                Publicação Consolidada na Camada Gold
              </h2>
              <p class="modal-sub">
                Cálculo de indicadores analíticos em PL/SQL e publicação das camadas cartográficas no mapa.
              </p>
            </div>
            <button class="btn-fechar" @click="fecharModalGold">✕</button>
          </header>

          <div class="modal-body">
            <div class="card-info-gold">
              <div class="icone-info-wrapper icone-info-wrapper--gold">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div class="info-texto">
                <h4>Consolidação e Publicação Analítica</h4>
                <p>
                  A publicação processa todos os dados consolidados na camada Silver, realizando os cruzamentos geoespaciais e calculando os indicadores ambientais para todos os imóveis da plataforma.
                </p>
                <div class="lista-detalhes-gold">
                  <div class="item-detalhe-gold">
                    <strong>1. Cálculo dos 7 Indicadores:</strong>
                    <span>ISAP, IAE, IRL, IAPP, IDesmat, IFC e ICV calculados via procedures Oracle Spatial.</span>
                  </div>
                  <div class="item-detalhe-gold">
                    <strong>2. Publicação das Camadas de Mapa:</strong>
                    <span>Generalização e simplificação geométrica das 6 camadas cartográficas para consulta interativa.</span>
                  </div>
                  <div class="item-detalhe-gold">
                    <strong>3. Promoção dos Lotes:</strong>
                    <span>Todos os lotes atualmente na camada Silver ({{ lotesNaSilver.length }} lote(s)) serão promovidos para Gold.</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="resumo-lote">
              <div class="resumo-item">
                <span class="resumo-rotulo">Lotes Aptos na Silver</span>
                <span class="resumo-valor">{{ lotesNaSilver.length }} lote(s)</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Camadas Cartográficas</span>
                <span class="resumo-valor">6 camadas</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Destino</span>
                <span class="badge-status badge--gold">Camada Gold</span>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-cancelar" @click="fecharModalGold">Cancelar</button>
            <button class="btn-confirmar-gold" @click="confirmarPublicacaoGold">
              Iniciar Migração para Gold
            </button>
          </footer>
        </template>

        <!-- Fase 2: Processando / Polling -->
        <template v-else-if="faseGold === 'PROCESSANDO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-gold">PROCESSAMENTO EM ANDAMENTO</span>
              <h2 class="modal-titulo">
                Calculando e Publicando na Gold...
              </h2>
              <p class="modal-sub">
                Executando cruzamentos geoespaciais em PL/SQL e simplificação de geometrias.
              </p>
            </div>
            <button
              class="btn-fechar"
              title="Fechar (a publicação continua em segundo plano)"
              aria-label="Fechar (a publicação continua em segundo plano)"
              @click="ocultarModalGold"
            >✕</button>
          </header>

          <div class="modal-body modal-body--centro">
            <div class="spinner-grande spinner-grande--gold"></div>
            <h3 class="progresso-titulo">
              Calculando Indicadores e Publicando Camadas
            </h3>
            <p class="progresso-sub">
              Por favor, aguarde. Este processo recalcula os índices analíticos e consolida os dados na camada Gold.
            </p>
            <p class="progresso-sub progresso-sub--dica">
              Pode fechar esta janela: a publicação continua e aparece no painel Processamentos.
            </p>

            <div v-if="statusGold?.indicadores" class="progresso-detalhe-card">
              <div class="linha-status-indicador">
                <span class="rotulo-indicador">Imóveis Analisados:</span>
                <strong class="valor-indicador">
                  {{ statusGold.indicadores.totalProcessado || 0 }}
                  <template v-if="statusGold.indicadores.totalEstimado">
                    de {{ statusGold.indicadores.totalEstimado }}
                  </template>
                </strong>
              </div>
              <div class="linha-status-indicador">
                <span class="rotulo-indicador">Sucessos:</span>
                <span class="texto-sucesso-valor">{{ statusGold.indicadores.totalSucesso || 0 }}</span>
              </div>
              <div v-if="statusGold.indicadores.totalFalha > 0" class="linha-status-indicador">
                <span class="rotulo-indicador">Falhas resilientes:</span>
                <span class="texto-falha-valor">{{ statusGold.indicadores.totalFalha }}</span>
              </div>
            </div>

            <div v-if="statusGold?.camadasMapa && statusGold.camadasMapa.length > 0" class="camadas-status-grid">
              <div
                v-for="camada in statusGold.camadasMapa"
                :key="camada.codigoCamada"
                class="camada-status-chip"
                :class="{ 'camada-status-chip--concluida': camada.status === 'CONCLUIDA' }"
              >
                <span class="chip-dot"></span>
                <span>{{ camada.codigoCamada }}</span>
                <span v-if="camada.status === 'CONCLUIDA'" class="chip-check">✓</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Fase 3: Sucesso -->
        <template v-else-if="faseGold === 'SUCESSO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-verde">PUBLICAÇÃO CONCLUÍDA</span>
              <h2 class="modal-titulo">Migração para a Gold Finalizada</h2>
            </div>
            <button class="btn-fechar" @click="fecharModalGold">✕</button>
          </header>

          <div class="modal-body modal-body--centro">
            <div class="icone-sucesso-animado">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Dados consolidados e disponíveis na Gold</h3>
            <p class="sub-sucesso">
              Os indicadores foram calculados e as camadas cartográficas estão prontas para visualização no mapa e consultas analíticas.
            </p>

            <div v-if="resultadoPublicacaoTudo" class="resultado-gold-resumo">
              <div class="resumo-item">
                <span class="resumo-rotulo">Imóveis Processados</span>
                <span class="resumo-valor">{{ resultadoPublicacaoTudo.totalImoveis }}</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Publicados com Sucesso</span>
                <span class="resumo-valor texto-verde">{{ resultadoPublicacaoTudo.imoveisPublicados }}</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Status Final</span>
                <span class="badge-status badge--gold">Migrado para Gold</span>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-concluir" @click="fecharModalGold">
              Concluir
            </button>
          </footer>
        </template>

        <!-- Fase 4: Erro -->
        <template v-else-if="faseGold === 'ERRO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-vermelha">FALHA NA MIGRAÇÃO</span>
              <h2 class="modal-titulo">Não foi possível concluir a publicação</h2>
            </div>
            <button class="btn-fechar" @click="fecharModalGold">✕</button>
          </header>

          <div class="modal-body">
            <div class="aviso-descarte">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <div>
                <strong>Erro durante a execução da transição:</strong>
                <p>{{ erroGold }}</p>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-cancelar" @click="fecharModalGold">Fechar</button>
            <button class="btn-confirmar-gold" @click="confirmarPublicacaoGold">
              Tentar Novamente
            </button>
          </footer>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/LotesView.css"></style>

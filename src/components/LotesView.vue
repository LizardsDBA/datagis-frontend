<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { buscarLotes, liberarLote, descartarLote } from '../services/loteService'

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
  const promovidos = lotes.value.filter(l => l.status === 'PROMOVIDO_SILVER').length
  const retidos = lotes.value.filter(l => l.status === 'RETIDO_QUARENTENA').length
  const descartados = lotes.value.filter(l => l.status === 'DESCARTADO').length
  const semMudanca = lotes.value.filter(l => l.status === 'SEM_MUDANCA').length
  return { total, promovidos, retidos, descartados, semMudanca }
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
  loteParaLiberar.value = null
  faseLiberacao.value = 'CONFIRMACAO'
  progressoPercentual.value = 0
  etapaAtual.value = 1
}

async function confirmarLiberacao() {
  if (!loteParaLiberar.value) return

  faseLiberacao.value = 'PROCESSANDO'
  progressoPercentual.value = 14
  etapaAtual.value = 1
  mensagemErroLiberacao.value = ''

  const inicio = Date.now()
  timerProgresso = setInterval(() => {
    const decorrido = Date.now() - inicio
    if (decorrido < 1000) {
      progressoPercentual.value = Math.min(30, progressoPercentual.value + 4)
      etapaAtual.value = 1
    } else if (decorrido < 2500) {
      progressoPercentual.value = Math.min(62, progressoPercentual.value + 3)
      etapaAtual.value = 2
    } else if (decorrido < 6000) {
      progressoPercentual.value = Math.min(90, progressoPercentual.value + 2)
      etapaAtual.value = 3
    }
  }, 220)

  const loteIdAlvo = loteParaLiberar.value.id
  try {
    await liberarLote(loteIdAlvo)

    if (timerProgresso) clearInterval(timerProgresso)
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
  } catch (e) {
    if (timerProgresso) clearInterval(timerProgresso)
    faseLiberacao.value = 'ERRO'
    mensagemErroLiberacao.value = e.message || 'Não foi possível enviar o lote para a Silver.'
  }
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

onMounted(() => {
  carregarLotes()
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

      <button class="btn-atualizar" @click="carregarLotes" :disabled="carregando" title="Recarregar lotes de ingestão">
        <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <span>Atualizar</span>
      </button>
    </header>

    <!-- Grid de Métricas Responsivo e Alinhado (5 KPIs) -->
    <section class="grid-metricas">
      <div class="card-metrica">
        <span class="metrica-label">Total de Lotes</span>
        <span class="metrica-valor">{{ metricas.total }}</span>
        <span class="metrica-sub">Execuções de ingestão</span>
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
                            lote.status === 'PROMOVIDO_SILVER' ? 'Promovido para Silver' :
                            lote.status === 'RETIDO_QUARENTENA' ? 'Retido na Quarentena' :
                            lote.status === 'DESCARTADO' ? 'Descartado' :
                            lote.status === 'SEM_MUDANCA' ? 'Sem Mudança' : lote.status
                          }}
                        </template>
                      </span>

                      <span v-if="lote.status === 'RETIDO_QUARENTENA' && !(loteParaLiberar?.id === lote.id && faseLiberacao === 'PROCESSANDO')" class="regra-aviso">
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
                <h4>O que vai acontecer</h4>
                <p>
                  Vamos conferir os registros de novo e salvar os que estiverem certos na Silver, onde ficam prontos para os cruzamentos e indicadores.
                </p>
                <p class="destaque-quarentena">
                  ✓ Os itens deste lote na Quarentena serão marcados como resolvidos.
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
              <span class="modal-etiqueta etiqueta-vermelha">FALHA NA TRANSIÇÃO</span>
              <h2 class="modal-titulo">Erro ao Liberar Lote #{{ loteParaLiberar.id }}</h2>
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
                <strong>Ocorreu uma falha no processamento:</strong>
                <p>{{ mensagemErroLiberacao }}</p>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="btn-cancelar" @click="fecharModalLiberacao">Fechar</button>
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
  </div>
</template>

<style scoped>
/* 
=========================================
  ESTILOS DO ACORDEÃO E GRID PADRONIZADO
========================================= 
*/

.grid-metricas {
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* Força os 5 cards na mesma linha */
  gap: 1rem;
}

@media (max-width: 1200px) {
  .grid-metricas {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
}

.metrica-label {
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-height: 2.2rem; /* Alinha horizontalmente cards com títulos longos */
  display: flex;
  align-items: flex-start;
}

.card-secao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: #ffffff;
  cursor: pointer;
  user-select: none;
}

.card-header:hover {
  background: #f8fafc;
}

.header-titulos {
  display: flex;
  flex-direction: column;
}

.diagnostico-titulo {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.btn-toggle-acordeao {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: color 0.15s ease;
  padding: 0;
}

.btn-toggle-acordeao:hover {
  color: #0f172a;
}

.btn-toggle-acordeao svg {
  width: 1.1rem;
  height: 1.1rem;
  transition: transform 0.2s ease;
}

.icone-rotacionado {
  transform: rotate(180deg);
}

.corpo-secao {
  padding: 0 1.25rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  margin-top: 0.25rem;
  padding-top: 1rem;
}

/* 
=========================================
  ESTILOS GERAIS DA PÁGINA (MANTIDOS)
========================================= 
*/

.pagina-lotes {
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

.btn-atualizar {
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

.btn-atualizar:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.icone-btn {
  width: 1rem;
  height: 1rem;
}

.card-metrica {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* Números acompanhando as cores das caixas */
.card-metrica:first-child .metrica-valor {
  color: #0284c7;
}

.card-metrica--promovido .metrica-valor {
  color: #16a34a;
}

.card-metrica--retido .metrica-valor {
  color: #d97706;
}

.card-metrica--descartado .metrica-valor {
  color: #dc2626;
}

.card-metrica--neutro .metrica-valor {
  color: #64748b;
}

.metrica-valor {
  font-size: 1.85rem;
  font-weight: 800;
  color: #0f172a;
}

.metrica-sub {
  font-size: 0.74rem;
  color: #94a3b8;
}

/* Alertas */
.alerta {
  padding: 0.85rem 1.15rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
}

.alerta--erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--sucesso {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* Filtros */
.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  /* Retirados padding e bordas, pois agora o card-secao envolve o conteúdo */
}

.grupo-campo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rotulo-filtro {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.select-filtro {
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  background: #ffffff;
  color: #1e293b;
}

.select-filtro:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.grupo-campo--busca {
  flex: 1;
  min-width: 260px;
}

.input-busca-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.icone-busca {
  position: absolute;
  left: 0.75rem;
  width: 1rem;
  height: 1rem;
  color: #94a3b8;
  pointer-events: none;
}

.input-busca {
  width: 100%;
  padding: 0.6rem 0.85rem 0.6rem 2.2rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  background: #ffffff;
  color: #1e293b;
}

.input-busca:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

/* Tabela de Lotes */
.tabela-container {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.85rem 1rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-dados td {
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.linha-tabela:hover {
  background: #fcfdfe;
}

.col-id {
  width: 90px;
  white-space: nowrap;
}

.badge-lote-id {
  font-family: var(--fonte-mono);
  font-weight: 800;
  font-size: 0.82rem;
  color: #0284c7;
  background: #e0f2fe;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
}

.col-fonte {
  min-width: 240px;
}

.fonte-nome {
  font-weight: 700;
  color: #0f172a;
}

.fonte-sub-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-top: 0.15rem;
}

.origem-ref-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.74rem;
  color: #475569;
  max-width: 320px;
}

.origem-texto {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--fonte-mono);
}

.col-registros {
  white-space: nowrap;
}

.valor-registros {
  font-size: 0.95rem;
  color: #0f172a;
  display: block;
}

.sub-rotulo {
  font-size: 0.72rem;
  color: #94a3b8;
}

.col-data {
  white-space: nowrap;
  font-size: 0.82rem;
  color: #475569;
}

.col-status {
  min-width: 220px;
}

.status-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.badge--promovido {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.badge--retido {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}

.badge--descartado {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.badge--neutro {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.badge--processando {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.regra-aviso {
  font-size: 0.73rem;
  color: #b45309;
  font-weight: 600;
}

.texto-azul {
  color: #0284c7;
}

.texto-concluido {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #15803d;
  font-weight: 700;
  background: #f0fdf4;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #dcfce7;
}

.col-acao-th {
  text-align: right;
  min-width: 260px;
}

.col-acao-td {
  text-align: right;
  min-width: 260px;
}

.acoes-retido {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn-acao {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-acao svg {
  width: 0.85rem;
  height: 0.85rem;
}

.btn-ver-erros {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

.btn-ver-erros:hover {
  background: #fde68a;
}

.btn-liberar {
  background: #15803d;
  color: #ffffff;
}

.btn-liberar:hover:not(:disabled) {
  background: #166534;
}

.btn-descartar {
  background: #ffffff;
  color: #dc2626;
  border-color: #fecaca;
}

.btn-descartar:hover:not(:disabled) {
  background: #fee2e2;
}

.btn--em-progresso {
  background: #0284c7;
  color: #ffffff;
  cursor: wait;
}

.spinner-pequeno {
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
  display: inline-block;
}

.spinner {
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

.estado-carregando,
.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 1rem;
  color: #64748b;
  gap: 0.6rem;
  text-align: center;
}

.estado-vazio svg {
  width: 2.5rem;
  height: 2.5rem;
  color: #94a3b8;
}

/* Modais */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fafbfc;
}

.modal-header--sucesso {
  background: #f0fdf4;
}

.modal-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.etiqueta-verde {
  color: #15803d;
}

.etiqueta-azul {
  color: #0284c7;
}

.etiqueta-vermelha {
  color: #dc2626;
}

.modal-titulo {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0.2rem 0;
}

.modal-sub {
  font-size: 0.84rem;
  color: #64748b;
  margin: 0;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.btn-fechar:hover {
  color: #0f172a;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card-info-liberacao {
  display: flex;
  gap: 0.85rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 1rem 1.15rem;
}

.icone-info-wrapper {
  color: #15803d;
  flex-shrink: 0;
}

.icone-info-wrapper svg {
  width: 1.5rem;
  height: 1.5rem;
}

.info-texto h4 {
  font-size: 0.92rem;
  font-weight: 700;
  color: #166534;
  margin-bottom: 0.25rem;
}

.info-texto p {
  font-size: 0.82rem;
  color: #1e293b;
  line-height: 1.4;
}

.destaque-quarentena {
  margin-top: 0.4rem;
  font-weight: 600;
  color: #15803d;
}

.resumo-lote {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.85rem 1rem;
}

.resumo-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.resumo-rotulo {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
}

.resumo-valor {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}

/* Stepper de Liberação */
.stepper-pipeline {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  transition: all 0.2s ease;
}

.step-ativo {
  border-color: #0284c7;
  background: #f0f9ff;
}

.step-concluido {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.step-circulo {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.78rem;
  flex-shrink: 0;
  background: #e2e8f0;
  color: #475569;
}

.step-concluido .step-circulo {
  background: #15803d;
  color: #ffffff;
}

.step-ativo .step-circulo {
  background: #0284c7;
  color: #ffffff;
}

.step-conteudo h5 {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.step-conteudo p {
  font-size: 0.74rem;
  color: #64748b;
  margin: 0.15rem 0 0;
}

.barra-trilho {
  height: 8px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}

.barra-preenchimento {
  height: 100%;
  background: linear-gradient(90deg, #0284c7, #15803d);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.barra--100 {
  width: 100%;
  background: #15803d;
}

.progresso-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.progresso-topo {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 700;
}

.modal-footer {
  padding: 1rem 1.5rem;
  background: #fafbfc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}

.btn-cancelar {
  padding: 0.6rem 1.1rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: #475569;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
}

.btn-confirmar-liberar {
  padding: 0.6rem 1.3rem;
  font-size: 0.86rem;
  font-weight: 700;
  color: #ffffff;
  background: #15803d;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-confirmar-liberar:hover {
  background: #166534;
}

.btn-concluir {
  padding: 0.6rem 1.5rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: #ffffff;
  background: #15803d;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.modal-body--centro {
  text-align: center;
  align-items: center;
  padding: 2.5rem 1.5rem;
}

.icone-sucesso-animado {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: #dcfce7;
  color: #15803d;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.icone-sucesso-animado svg {
  width: 2rem;
  height: 2rem;
}

.sub-sucesso {
  font-size: 0.86rem;
  color: #475569;
  max-width: 28rem;
  margin: 0.25rem 0 1.25rem;
}

/* Modal Descarte */
.aviso-descarte {
  display: flex;
  gap: 0.85rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 1rem 1.15rem;
  border-radius: 8px;
  color: #991b1b;
}

.aviso-descarte svg {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.aviso-descarte p {
  font-size: 0.82rem;
  margin-top: 0.2rem;
}

.campo-motivo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rotulo-motivo {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}

.textarea-motivo {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.86rem;
  outline: none;
  color: #1e293b;
}

.textarea-motivo:focus {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
}

.btn-confirmar-descarte {
  padding: 0.6rem 1.25rem;
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.86rem;
  cursor: pointer;
}

.btn-confirmar-descarte:hover:not(:disabled) {
  background: #b91c1c;
}

@media (max-width: 768px) {
  .topo-pagina {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-atualizar {
    justify-content: center;
  }

  .resumo-lote {
    grid-template-columns: 1fr;
  }
}
</style>
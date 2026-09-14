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
      return matchId || matchFonte
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
  if (faseLiberacao.value === 'PROCESSANDO') return // Previne fechar no meio da transação atômica
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

  // Simulação realista do avanço por etapas durante a transição
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

    // Atualização otimista imediata na tabela
    const item = lotes.value.find(l => l.id === loteIdAlvo)
    if (item) {
      item.status = 'PROMOVIDO_SILVER'
    }
    sucesso.value = `Lote #${loteIdAlvo} liberado com sucesso para a camada Silver!`

    // Recarrega em background para sincronizar métricas
    carregarLotes()

    // Fecha o modal suavemente após 1.8 segundos
    setTimeout(() => {
      if (faseLiberacao.value === 'SUCESSO' && loteParaLiberar.value?.id === loteIdAlvo) {
        fecharModalLiberacao()
      }
    }, 1800)
  } catch (e) {
    if (timerProgresso) clearInterval(timerProgresso)
    faseLiberacao.value = 'ERRO'
    mensagemErroLiberacao.value = e.message || 'Falha ao liberar lote para a camada Silver.'
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
        <p class="etiqueta">PIPELINE AUTOMÁTICO</p>
        <h1 class="titulo">Lotes de Ingestão & Pipeline</h1>
        <p class="subtitulo">
          Monitoramento do pipeline de transição Bronze → Silver e aplicação da regra de integridade total (All-or-Nothing).
        </p>
      </div>
      <button class="btn-atualizar" @click="carregarLotes" :disabled="carregando">
        <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        Atualizar
      </button>
    </header>

    <!-- Cards de Métricas -->
    <section class="grid-metricas">
      <div class="card-metrica">
        <span class="metrica-label">Total de Lotes</span>
        <span class="metrica-valor">{{ metricas.total }}</span>
        <span class="metrica-sub">Execuções de ingestão</span>
      </div>

      <div class="card-metrica card-metrica--promovido">
        <span class="metrica-label">Promovidos para Silver</span>
        <span class="metrica-valor">{{ metricas.promovidos }}</span>
        <span class="metrica-sub">100% íntegros e validados</span>
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
        <span class="metrica-sub">Hash inalterado</span>
      </div>
    </section>

    <!-- Mensagens de Alerta -->
    <div v-if="erro" class="alerta alerta--erro">{{ erro }}</div>
    <div v-if="sucesso" class="alerta alerta--sucesso">{{ sucesso }}</div>

    <!-- Barra de Filtros -->
    <section class="barra-filtros">
      <div class="grupo-campo">
        <label class="rotulo-filtro">Status do Lote:</label>
        <select v-model="filtroStatus" class="select-filtro">
          <option value="TODOS">Todos os Status</option>
          <option value="PROMOVIDO_SILVER">Promovido para Silver</option>
          <option value="RETIDO_QUARENTENA">Retido na Quarentena</option>
          <option value="DESCARTADO">Descartado</option>
          <option value="SEM_MUDANCA">Sem Alteração</option>
        </select>
      </div>

      <div class="grupo-campo grupo-campo--busca">
        <label class="rotulo-filtro">Buscar por Lote ou Fonte:</label>
        <input
          v-model="filtroBusca"
          type="text"
          placeholder="Ex: #12 ou IBAMA..."
          class="input-busca"
        />
      </div>
    </section>

    <!-- Tabela de Lotes -->
    <section class="tabela-container">
      <div v-if="carregando" class="estado-carregando">
        <div class="spinner"></div>
        <span>Carregando histórico de lotes...</span>
      </div>

      <div v-else-if="lotesFiltrados.length === 0" class="estado-vazio">
        <h3>Nenhum lote encontrado</h3>
        <p>Nenhuma ingestão corresponde aos filtros aplicados.</p>
      </div>

      <table v-else class="tabela-dados">
        <thead>
          <tr>
            <th>Lote ID</th>
            <th>Fonte de Dados</th>
            <th>Registros</th>
            <th>Data de Execução</th>
            <th>Status da Transição</th>
            <th class="col-acao">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lote in lotesFiltrados" :key="lote.id" class="linha-tabela">
            <td class="col-id">
              <span class="badge-lote-id">#{{ lote.id }}</span>
            </td>
            <td>
              <div class="fonte-nome">{{ lote.fonteDadoNome }}</div>
              <small class="texto-apagado">Fonte #{{ lote.fonteDadoId }}</small>
            </td>
            <td>
              <strong>{{ (lote.quantidadeRegistros || 0).toLocaleString('pt-BR') }}</strong>
            </td>
            <td>
              {{ formatarData(lote.dataExecucao) }}
            </td>
            <td>
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
            <td class="col-acao">
              <!-- Ações para Lote Retido na Quarentena -->
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
                    Inspecionar Erros
                  </button>
                  <button
                    class="btn-acao btn-liberar"
                    title="Liberar lote para Silver após validação do analista"
                    :disabled="processandoAcao || faseLiberacao === 'PROCESSANDO'"
                    @click="abrirModalLiberacao(lote)"
                  >
                    Liberar para Silver
                  </button>
                  <button
                    class="btn-acao btn-descartar"
                    title="Descartar lote e não promover nenhum registro"
                    :disabled="processandoAcao || faseLiberacao === 'PROCESSANDO'"
                    @click="abrirModalDescarte(lote)"
                  >
                    Descartar
                  </button>
                </template>
              </div>

              <!-- Ação para Lote Promovido -->
              <span v-else-if="lote.status === 'PROMOVIDO_SILVER'" class="texto-concluido">
                ✓ Disponível na Silver
              </span>

              <!-- Outros -->
              <span v-else class="texto-apagado">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Modal de Liberação de Lote com Barra de Progresso e Stepper -->
    <div v-if="loteParaLiberar" class="modal-backdrop" @click.self="fecharModalLiberacao">
      <div class="modal-dialog modal-dialog--liberacao">
        
        <!-- Fase 1: Confirmação -->
        <template v-if="faseLiberacao === 'CONFIRMACAO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-verde">TRANSIÇÃO BRONZE → SILVER</span>
              <h2 class="modal-titulo">Liberar Lote #{{ loteParaLiberar.id }} para a Silver</h2>
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
                <h4>Promoção de Dados Válidos</h4>
                <p>
                  Esta ação reprocessará as regras de validação, efetuará a conversão para <code>MDSYS.SDO_GEOMETRY</code> (SRID 4674) e persistirá todos os registros aprovados na tabela <strong>SILVER.IMOVEL_RURAL</strong>.
                </p>
                <p class="destaque-quarentena">
                  ✓ As pendências deste lote na quarentena serão atualizadas para <strong>CORRIGIDO_REPROCESSADO</strong>.
                </p>
              </div>
            </div>

            <div class="resumo-lote">
              <div class="resumo-item">
                <span class="resumo-rotulo">Lote ID</span>
                <span class="resumo-valor">#{{ loteParaLiberar.id }}</span>
              </div>
              <div class="resumo-item">
                <span class="resumo-rotulo">Registros</span>
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
              Confirmar e Liberar para Silver
            </button>
          </footer>
        </template>

        <!-- Fase 2: Processando com Barra de Progresso e Stepper -->
        <template v-else-if="faseLiberacao === 'PROCESSANDO'">
          <header class="modal-header">
            <div>
              <span class="modal-etiqueta etiqueta-azul">PIPELINE EM EXECUÇÃO</span>
              <h2 class="modal-titulo">Promovendo Lote #{{ loteParaLiberar.id }} para Silver...</h2>
              <p class="modal-sub">
                Processando {{ (loteParaLiberar.quantidadeRegistros || 0).toLocaleString('pt-BR') }} registros com persistência atômica
              </p>
            </div>
          </header>

          <div class="modal-body">
            <!-- Barra de Progresso Animada -->
            <div class="progresso-wrapper">
              <div class="progresso-topo">
                <span class="progresso-label">Progresso da Transição</span>
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
              <!-- Etapa 1 -->
              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 1, 'step-concluido': etapaAtual > 1 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 1">✓</span>
                  <div v-else-if="etapaAtual === 1" class="step-spinner"></div>
                  <span v-else>1</span>
                </div>
                <div class="step-conteudo">
                  <h5>Validação de Regras & Deduplicação</h5>
                  <p>Checagem de chaves de negócio e integridade referencial</p>
                </div>
              </div>

              <!-- Etapa 2 -->
              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 2, 'step-concluido': etapaAtual > 2 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 2">✓</span>
                  <div v-else-if="etapaAtual === 2" class="step-spinner"></div>
                  <span v-else>2</span>
                </div>
                <div class="step-conteudo">
                  <h5>Conversão Espacial MDSYS.SDO_GEOMETRY</h5>
                  <p>Reprojeção WKT e integridade topológica SRID 4674 (SIRGAS 2000)</p>
                </div>
              </div>

              <!-- Etapa 3 -->
              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 3, 'step-concluido': etapaAtual > 3 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual > 3">✓</span>
                  <div v-else-if="etapaAtual === 3" class="step-spinner"></div>
                  <span v-else>3</span>
                </div>
                <div class="step-conteudo">
                  <h5>Persistência Otimizada na Camada Silver</h5>
                  <p>Upsert atômico dos registros com resolução de municípios em memória</p>
                </div>
              </div>

              <!-- Etapa 4 -->
              <div class="step-item" :class="{ 'step-ativo': etapaAtual === 4, 'step-concluido': etapaAtual >= 4 }">
                <div class="step-circulo">
                  <span v-if="etapaAtual >= 4">✓</span>
                  <div v-else class="step-circulo-vazio">4</div>
                </div>
                <div class="step-conteudo">
                  <h5>Baixa na Quarentena & Conclusão</h5>
                  <p>Atualização de status para PROMOVIDO_SILVER no schema CONTROLE</p>
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <span class="texto-aviso-processando">
              <span class="spinner-pequeno"></span> Executando transação no Oracle Database...
            </span>
          </footer>
        </template>

        <!-- Fase 3: Sucesso -->
        <template v-else-if="faseLiberacao === 'SUCESSO'">
          <header class="modal-header modal-header--sucesso">
            <div>
              <span class="modal-etiqueta etiqueta-verde">TRANSIÇÃO CONCLUÍDA</span>
              <h2 class="modal-titulo">Lote #{{ loteParaLiberar.id }} Promovido com Sucesso!</h2>
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
            <h3>Dados Disponíveis na Silver</h3>
            <p class="sub-sucesso">
              Todos os registros válidos do lote foram promovidos para a camada Silver e estão prontos para consulta.
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
            <span class="modal-etiqueta">REJEIÇÃO DE LOTE</span>
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
            <label>Justificativa do Descarte *</label>
            <textarea
              v-model="motivoDescarte"
              rows="4"
              placeholder="Descreva o motivo da rejeição do lote (ex: arquivo corrompido, coordenadas inválidas recorrentes, base desatualizada)..."
              required
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
.pagina-lotes {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.etiqueta {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e7d32;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.titulo {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  color: #1a1a1a;
}

.subtitulo {
  margin: 0;
  font-size: 0.88rem;
  color: #6b7280;
}

.btn-atualizar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-atualizar:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.icone-btn {
  width: 0.95rem;
  height: 0.95rem;
}

/* Grid de Métricas */
.grid-metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.card-metrica {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metrica-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metrica-valor {
  font-size: 1.7rem;
  font-weight: 800;
  color: #0f172a;
}

.metrica-sub {
  font-size: 0.72rem;
  color: #94a3b8;
}

.card-metrica--promovido {
  border-left: 4px solid #16a34a;
}

.card-metrica--retido {
  border-left: 4px solid #f59e0b;
}

.card-metrica--descartado {
  border-left: 4px solid #dc2626;
}

.card-metrica--neutro {
  border-left: 4px solid #94a3b8;
}

/* Alertas */
.alerta {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
}

.alerta--erro {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--sucesso {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* Filtros */
.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  background: #ffffff;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  align-items: flex-end;
}

.grupo-campo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rotulo-filtro {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}

.select-filtro,
.input-busca {
  padding: 0.55rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 0.85rem;
  outline: none;
  background: #ffffff;
}

.grupo-campo--busca {
  flex: 1;
  min-width: 240px;
}

/* Tabela */
.tabela-container {
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #e2e8f0;
}

.tabela-dados td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.linha-tabela:hover {
  background: #fcfdfe;
}

.col-id {
  width: 80px;
}

.badge-lote-id {
  font-weight: 700;
  font-size: 0.8rem;
  color: #0284c7;
  background: #e0f2fe;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.fonte-nome {
  font-weight: 600;
  color: #1e293b;
}

.texto-apagado {
  color: #94a3b8;
  font-size: 0.75rem;
}

.status-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.badge-status {
  display: inline-block;
  width: fit-content;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
}

.badge--promovido {
  background: #dcfce7;
  color: #15803d;
}

.badge--retido {
  background: #fef3c7;
  color: #b45309;
}

.badge--descartado {
  background: #fee2e2;
  color: #b91c1c;
}

.badge--neutro {
  background: #f1f5f9;
  color: #475569;
}

.regra-aviso {
  font-size: 0.72rem;
  color: #d97706;
  font-weight: 500;
}

.texto-concluido {
  font-size: 0.82rem;
  color: #15803d;
  font-weight: 600;
}

.acoes-retido {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn-acao {
  padding: 0.35rem 0.65rem;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
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
  background: #2e7d32;
  color: #fff;
}

.btn-liberar:hover:not(:disabled) {
  background: #256628;
}

.btn-descartar {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}

.btn-descartar:hover:not(:disabled) {
  background: #fecaca;
}

.estado-carregando,
.estado-vazio {
  padding: 3rem;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid #cbd5e1;
  border-top-color: #2e7d32;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Modal */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
  box-sizing: border-box;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 540px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #eef0f2;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #dc2626;
  text-transform: uppercase;
}

.modal-titulo {
  margin: 0.2rem 0;
  font-size: 1.2rem;
  color: #1a1a1a;
}

.modal-sub {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.aviso-descarte {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  display: flex;
  gap: 0.75rem;
  color: #9f1239;
  font-size: 0.82rem;
}

.aviso-descarte svg {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.campo-motivo {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.campo-motivo label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}

.campo-motivo textarea {
  padding: 0.65rem;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  resize: vertical;
  outline: none;
}

.campo-motivo textarea:focus {
  border-color: #dc2626;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #eef0f2;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #fafbfc;
}

.btn-cancelar {
  padding: 0.5rem 1rem;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}

.btn-confirmar-descarte {
  padding: 0.5rem 1.25rem;
  background: #dc2626;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
}

.btn-confirmar-descarte:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Modal de Liberação & Progresso */
.modal-dialog--liberacao {
  max-width: 560px;
  width: 92%;
}

.etiqueta-verde {
  color: #16a34a !important;
}

.etiqueta-azul {
  color: #2563eb !important;
}

.etiqueta-vermelha {
  color: #dc2626 !important;
}

.card-info-liberacao {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 1rem 1.1rem;
  display: flex;
  gap: 0.85rem;
}

.icone-info-wrapper {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: #dcfce7;
  color: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icone-info-wrapper svg {
  width: 1.3rem;
  height: 1.3rem;
}

.info-texto h4 {
  margin: 0 0 0.3rem;
  font-size: 0.92rem;
  color: #166534;
}

.info-texto p {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  color: #374151;
  line-height: 1.35;
}

.destaque-quarentena {
  font-weight: 600;
  color: #15803d !important;
  margin-bottom: 0 !important;
}

.resumo-lote {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.85rem 1rem;
}

.resumo-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.resumo-rotulo {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.resumo-valor {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.btn-confirmar-liberar {
  padding: 0.55rem 1.35rem;
  background: #16a34a;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-confirmar-liberar:hover {
  background: #15803d;
}

/* Barra de Progresso */
.progresso-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.progresso-topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
}

.progresso-label {
  font-weight: 600;
  color: #334155;
}

.progresso-porcentagem {
  font-weight: 700;
  color: #2563eb;
  font-size: 0.92rem;
}

.barra-trilho {
  width: 100%;
  height: 10px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.barra-preenchimento {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%);
  border-radius: 999px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.barra-brilho {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.barra--100 {
  background: #10b981 !important;
  width: 100% !important;
}

/* Stepper de Etapas */
.stepper-pipeline {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  background: #fafbfc;
  border: 1px solid #eef0f2;
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  opacity: 0.45;
  transition: all 0.25s ease;
}

.step-item.step-ativo,
.step-item.step-concluido {
  opacity: 1;
}

.step-circulo {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.step-ativo .step-circulo {
  background: #dbeafe;
  color: #2563eb;
  border: 1.5px solid #3b82f6;
}

.step-concluido .step-circulo {
  background: #dcfce7;
  color: #16a34a;
}

.step-circulo-vazio {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #3b82f6;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.step-conteudo h5 {
  margin: 0;
  font-size: 0.85rem;
  color: #1e293b;
}

.step-conteudo p {
  margin: 0.15rem 0 0;
  font-size: 0.74rem;
  color: #64748b;
}

.texto-aviso-processando {
  font-size: 0.8rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Sucesso */
.modal-body--centro {
  text-align: center;
  padding: 2rem 1.5rem;
}

.icone-sucesso-animado {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #dcfce7;
  color: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 0.75rem;
  box-shadow: 0 0 0 8px rgba(220, 252, 231, 0.5);
}

.icone-sucesso-animado svg {
  width: 2rem;
  height: 2rem;
}

.sub-sucesso {
  color: #64748b;
  font-size: 0.85rem;
  margin: 0.25rem 0 1.25rem;
}

.btn-concluir {
  padding: 0.55rem 1.5rem;
  background: #10b981;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-concluir:hover {
  background: #059669;
}

/* Estados na Tabela */
.badge--processando {
  background: #eff6ff !important;
  color: #1d4ed8 !important;
  border: 1px solid #bfdbfe !important;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.spinner-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2563eb;
  animation: pulse-dot 1.2s infinite;
}

@keyframes pulse-dot {
  0% { transform: scale(0.85); opacity: 0.4; }
  50% { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.4; }
}

.spinner-pequeno {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
  vertical-align: middle;
}

.btn--em-progresso {
  background: #e0f2fe !important;
  color: #0369a1 !important;
  border-color: #bae6fd !important;
  cursor: wait !important;
}

.texto-azul {
  color: #2563eb !important;
}
</style>

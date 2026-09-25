<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  buscarItensQuarentena,
  buscarMetricasQuarentena,
  buscarTiposErro,
  buscarStatusAnalise,
} from '../services/quarentenaService'
import DetalheQuarentenaModal from './DetalheQuarentenaModal.vue'
import DiagnosticoChart from './DiagnosticoChart.vue'

const route = useRoute()
const router = useRouter()

const itens = ref([])
const metricas = ref(null)
const tiposErro = ref([])
const statusLista = ref([])
const carregando = ref(false)
const erro = ref(null)
const topInconsistencia = ref(null)
const diagnosticoChartRef = ref(null)

const secoesExpandidas = reactive({
  filtros: true,
  tabela: true
})

const mensagemSucesso = ref(null)
let timeoutSucesso = null

function handleAtualizado(res) {
  if (res?.totalColetivoAprovados > 0) {
    let msg = `Registro revalidado! Outros ${res.totalColetivoAprovados} registro(s) com erro de domínio também foram revalidados e promovidos.`
    if (res.lotesLiberados && res.lotesLiberados.length > 0) {
      msg += ` Lote(s) #${res.lotesLiberados.join(', #')} liberado(s) integralmente para a Silver!`
    }
    exibirMensagemSucesso(msg)
  } else if (res?.lotesLiberados && res.lotesLiberados.length > 0) {
    exibirMensagemSucesso(`Registro revalidado com sucesso! Lote(s) #${res.lotesLiberados.join(', #')} liberado(s) integralmente para a Silver!`)
  }
    carregarTudo()
  diagnosticoChartRef.value?.recarregar()
}

function exibirMensagemSucesso(msg) {
  mensagemSucesso.value = msg
  if (timeoutSucesso) clearTimeout(timeoutSucesso)
  timeoutSucesso = setTimeout(() => {
    mensagemSucesso.value = null
  }, 8000)
}

// Paginação
const paginaAtual = ref(1)
const tamanhoPagina = ref(50)
const totalItens = ref(0)

const totalPaginas = computed(() => {
  if (!totalItens.value || totalItens.value <= 0) return 1
  return Math.ceil(totalItens.value / tamanhoPagina.value)
})

const indiceInicio = computed(() => {
  if (totalItens.value === 0) return 0
  return (paginaAtual.value - 1) * tamanhoPagina.value + 1
})

const indiceFim = computed(() => {
  if (totalItens.value === 0) return 0
  return Math.min(paginaAtual.value * tamanhoPagina.value, totalItens.value)
})

const motivosExpandidos = reactive({})

function alternarMotivoExpandido(itemKey) {
  motivosExpandidos[itemKey] = !motivosExpandidos[itemKey]
}

const filtroEntidade = ref('todas')
const filtroStatus = ref('todos') 
const filtroTipoErro = ref('todos')
const filtroBusca = ref('')
const filtroLoteId = ref(route.query.loteId ? String(route.query.loteId) : '')

function selecionarFiltroStatus(st) {
  filtroStatus.value = st
  paginaAtual.value = 1
  aplicarFiltros(true)
}

const itemSelecionado = ref(null)

const entidadesDisponiveis = [
  { valor: 'todas', label: 'Todas as Entidades' },
  { valor: 'imovel_rural', label: 'Imóveis Rurais' },
  { valor: 'area_protegida', label: 'Áreas Protegidas' },
  { valor: 'embargo_ambiental', label: 'Embargos Ambientais' },
  { valor: 'auto_infracao', label: 'Autos de Infração' },
  { valor: 'desmatamento', label: 'Desmatamento' },
  { valor: 'foco_calor', label: 'Focos de Calor' },
  { valor: 'municipio', label: 'Municípios' },
]

async function carregarTudo() {
  carregando.value = true
  erro.value = null
  try {
    const [met, itensRes, errRes, stRes] = await Promise.all([
      buscarMetricasQuarentena(),
      buscarItensQuarentena({
        entidade: filtroEntidade.value,
        status: filtroStatus.value,
        tipoErro: filtroTipoErro.value,
        loteIngestaoId: filtroLoteId.value ? Number(filtroLoteId.value) : undefined,
        pagina: paginaAtual.value - 1,
        tamanho: tamanhoPagina.value,
      }),
      buscarTiposErro(),
      buscarStatusAnalise(),
    ])
    metricas.value = met
    itens.value = itensRes.itens
    totalItens.value = itensRes.totalCount
    tiposErro.value = errRes
    statusLista.value = stRes
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar dados da quarentena'
  } finally {
    carregando.value = false
  }
}

async function aplicarFiltros(resetarPagina = true) {
  if (resetarPagina) {
    paginaAtual.value = 1
  }
  carregando.value = true
  erro.value = null
  try {
    const res = await buscarItensQuarentena({
      entidade: filtroEntidade.value,
      status: filtroStatus.value,
      tipoErro: filtroTipoErro.value,
      loteIngestaoId: filtroLoteId.value ? Number(filtroLoteId.value) : undefined,
      pagina: paginaAtual.value - 1,
      tamanho: tamanhoPagina.value,
    })
    itens.value = res.itens
    totalItens.value = res.totalCount
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function mudarPagina(novaPagina) {
  if (novaPagina < 1 || novaPagina > totalPaginas.value || novaPagina === paginaAtual.value) return
  paginaAtual.value = novaPagina
  aplicarFiltros(false)
}

function mudarTamanhoPagina(novoTamanho) {
  tamanhoPagina.value = Number(novoTamanho)
  paginaAtual.value = 1
  aplicarFiltros(false)
}

function filtrarPorLote(id) {
  filtroLoteId.value = String(id)
  paginaAtual.value = 1
  router.replace({ query: { loteId: id } })
  aplicarFiltros(false)
}

function removerFiltroLote() {
  filtroLoteId.value = ''
  paginaAtual.value = 1
  router.replace({ query: {} })
  aplicarFiltros(false)
}

const itensFiltrados = computed(() => {
  if (!filtroBusca.value.trim()) return itens.value
  const termo = filtroBusca.value.toLowerCase()
  return itens.value.filter(i =>
    (i.chaveIdentificacao && i.chaveIdentificacao.toLowerCase().includes(termo)) ||
    (i.campoProblema && i.campoProblema.toLowerCase().includes(termo)) ||
    (i.motivoRejeicao && i.motivoRejeicao.toLowerCase().includes(termo)) ||
    (i.tipoErroCodigo && i.tipoErroCodigo.toLowerCase().includes(termo))
  )
})

function abrirDetalhes(item) {
  itemSelecionado.value = item
}

function fecharDetalhes() {
  itemSelecionado.value = null
}

function badgeTipoErro(tipo) {
  if (!tipo) return 'badge-tag--neutro'
  if (tipo.includes('GEOMETRIA') || tipo.includes('TERRITORIAL')) return 'badge-tag--espacial'
  if (tipo.includes('CPF') || tipo.includes('DOMINIO') || tipo.includes('REFERENCIA')) return 'badge-tag--alerta'
  if (tipo.includes('REGRESSAO')) return 'badge-tag--erro'
  return 'badge-tag--neutro'
}

function badgeStatus(status) {
  if (status === 'PENDENTE') return 'badge-tag--alerta'
  if (status === 'EM_ANALISE') return 'badge-tag--info'
  if (status === 'CORRIGIDO_REPROCESSADO') return 'badge-tag--sucesso'
  if (status === 'DESCARTADO') return 'badge-tag--neutro'
  return 'badge-tag--neutro'
}

onMounted(() => {
  carregarTudo()
})
</script>

<template>
  <div class="pagina-quarentena">
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">QUALIDADE & TRIAGEM</p>
        <h1 class="titulo">Quarentena & Qualidade de Dados</h1>
        <p class="subtitulo">
          Auditoria de inconsistências e resolução de pendências antes da promoção definitiva para a camada Silver.
        </p>
      </div>
      <button class="btn-atualizar" @click="carregarTudo" :disabled="carregando" title="Recarregar registros">
        <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <span>Atualizar</span>
      </button>
    </header>

    <!-- Banner de Sucesso / Promoção Coletiva -->
    <transition name="fade">
      <div v-if="mensagemSucesso" class="banner-sucesso-flutuante">
        <span class="icone-check">✓</span>
        <span class="texto-sucesso">{{ mensagemSucesso }}</span>
        <button class="btn-fechar-banner" @click="mensagemSucesso = null" title="Fechar aviso">&times;</button>
      </div>
    </transition>

    <!-- Cards de Métricas Interativos (Clicáveis) -->
    <section v-if="metricas" class="grid-metricas">
      <div class="card-metrica card-metrica--clicavel" :class="{ 'card-metrica--ativo': filtroStatus === 'todos' }" @click="selecionarFiltroStatus('todos')">
        <span class="metrica-label">Total Retido</span>
        <span class="metrica-valor">{{ metricas.totalRegistros }}</span>
        <span class="metrica-sub">Todos os registros</span>
      </div>
      <div class="card-metrica card-metrica--pendente card-metrica--clicavel" :class="{ 'card-metrica--ativo': filtroStatus === 'PENDENTE' }" @click="selecionarFiltroStatus('PENDENTE')">
        <span class="metrica-label">Pendentes de Análise</span>
        <span class="metrica-valor">{{ metricas.totalPendentes }}</span>
        <span class="metrica-sub">Aguardando operador (RN007)</span>
      </div>
      <div class="card-metrica card-metrica--analise card-metrica--clicavel" :class="{ 'card-metrica--ativo': filtroStatus === 'EM_ANALISE' }" @click="selecionarFiltroStatus('EM_ANALISE')">
        <span class="metrica-label">Em Análise</span>
        <span class="metrica-valor">{{ metricas.totalEmAnalise }}</span>
        <span class="metrica-sub">Em tratamento ativo</span>
      </div>
      <div class="card-metrica card-metrica--sucesso card-metrica--clicavel" :class="{ 'card-metrica--ativo': filtroStatus === 'CORRIGIDO_REPROCESSADO' }" @click="selecionarFiltroStatus('CORRIGIDO_REPROCESSADO')">
        <span class="metrica-label">Corrigidos & Promovidos</span>
        <span class="metrica-valor">{{ metricas.totalCorrigidos }}</span>
        <span class="metrica-sub">Liberados para Silver</span>
      </div>
      <div class="card-metrica card-metrica--descarte card-metrica--clicavel" :class="{ 'card-metrica--ativo': filtroStatus === 'DESCARTADO' }" @click="selecionarFiltroStatus('DESCARTADO')">
        <span class="metrica-label">Descartados</span>
        <span class="metrica-valor">{{ metricas.totalDescartados }}</span>
        <span class="metrica-sub">Registros irrecuperáveis</span>
      </div>
    </section>

    <section v-if="topInconsistencia" class="secao-ofensor">
      <div class="banner-ofensor">
        <div class="ofensor-info">
          <span class="ofensor-label">Principal Ofensor:</span>
          <span class="ofensor-nome">{{ topInconsistencia.rotulo }}</span>
        </div>
        <div class="ofensor-valor-container">
          <span class="ofensor-valor">{{ topInconsistencia.quantidade.toLocaleString('pt-BR') }}</span>
          <span class="ofensor-sub">Registros afetados</span>
        </div>
      </div>
    </section>

    <section class="secao-diagnostico">
      <DiagnosticoChart ref="diagnosticoChartRef" :loteId="filtroLoteId" @top-inconsistencia="topInconsistencia = $event" />
    </section>

    <div class="card-acordeao">
      <div class="acordeao-header" @click="secoesExpandidas.filtros = !secoesExpandidas.filtros">
        <h3 class="acordeao-titulo">Pesquisa e Filtros</h3>
        <button class="btn-toggle-acordeao">
          <span>{{ secoesExpandidas.filtros ? 'Recolher' : 'Expandir' }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'icone-rotacionado': !secoesExpandidas.filtros }"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
      </div>
      <div v-show="secoesExpandidas.filtros" class="acordeao-corpo">
        <section class="barra-filtros">
          <div class="grupo-campo">
            <label class="rotulo-filtro">Entidade Silver:</label>
            <select v-model="filtroEntidade" @change="aplicarFiltros" class="select-filtro">
              <option v-for="ent in entidadesDisponiveis" :key="ent.valor" :value="ent.valor">{{ ent.label }}</option>
            </select>
          </div>
          <div class="grupo-campo">
            <label class="rotulo-filtro">Status da Análise:</label>
            <select v-model="filtroStatus" @change="aplicarFiltros" class="select-filtro">
              <option value="todos">Todos os Status</option>
              <option v-for="st in statusLista" :key="st.codigo" :value="st.codigo">{{ st.descricao }}</option>
            </select>
          </div>
          <div class="grupo-campo">
            <label class="rotulo-filtro">Tipo de Erro:</label>
            <select v-model="filtroTipoErro" @change="aplicarFiltros" class="select-filtro">
              <option value="todos">Todos os Tipos</option>
              <option v-for="te in tiposErro" :key="te.codigo" :value="te.codigo">{{ te.codigo }}</option>
            </select>
          </div>
          <div class="grupo-campo grupo-campo--lote">
            <label class="rotulo-filtro">Lote ID:</label>
            <input v-model="filtroLoteId" type="number" placeholder="Ex: 1" class="input-filtro-lote" @change="aplicarFiltros" />
          </div>
          <div class="grupo-campo grupo-campo--busca">
            <label class="rotulo-filtro">Buscar por texto:</label>
            <div class="input-busca-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icone-busca">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input v-model="filtroBusca" type="text" placeholder="Chave, campo ou motivo..." class="input-busca" />
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="card-acordeao">
      <div class="acordeao-header" @click="secoesExpandidas.tabela = !secoesExpandidas.tabela">
        <h3 class="acordeao-titulo">Registros Isolados em Quarentena</h3>
        <button class="btn-toggle-acordeao">
          <span>{{ secoesExpandidas.tabela ? 'Recolher' : 'Expandir' }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'icone-rotacionado': !secoesExpandidas.tabela }"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
      </div>
      <div v-show="secoesExpandidas.tabela" class="acordeao-corpo">
        <!-- Banner Informativo quando filtrado por Lote -->
        <div v-if="filtroLoteId" class="banner-filtro-lote">
          <div class="banner-lote-info">
            <span class="badge-lote-banner">LOTE #{{ filtroLoteId }}</span>
            <span>
              Exibindo inconsistências do <strong>Lote #{{ filtroLoteId }}</strong>. Pela regra de integridade total,
              este lote está retido e <strong>0 registros foram para a Silver</strong> até sua liberação.
            </span>
          </div>
          <div class="banner-lote-acoes">
            <button class="btn-banner-link" @click="router.push('/lotes')">Ver no Pipeline →</button>
            <button class="btn-banner-remover" @click="removerFiltroLote">Limpar filtro de lote ✕</button>
          </div>
        </div>

        <!-- Banner de Erro Global -->
        <div v-if="erro" class="banner-erro">
          ✕ {{ erro }}
        </div>

        <section class="tabela-container">
          <div v-if="carregando" class="estado-carregando">
            <div class="spinner"></div>
            <span>Consultando registros da quarentena...</span>
          </div>

          <div v-else-if="itensFiltrados.length === 0" class="estado-vazio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <h3>Nenhuma inconsistência encontrada</h3>
            <p>Nenhum registro retido corresponde aos filtros selecionados no momento.</p>
          </div>

          <div v-else class="tabela-responsiva-wrapper">
            <table class="tabela-dados">
              <thead>
                <tr>
                  <th>Chave Natural / ID</th>
                  <th>Entidade</th>
                  <th>Tipo de Erro</th>
                  <th>Campo & Motivo da Rejeição</th>
                  <th>Origem & Lote</th>
                  <th>Status</th>
                  <th class="col-acao-th">Ação</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in itensFiltrados" :key="item.entidade + '-' + item.id" class="linha-tabela">
                  <td class="col-chave">
                    <div class="chave-wrapper" :title="item.chaveIdentificacao">
                      <code class="chave-codigo">{{ item.chaveIdentificacao || '—' }}</code>
                      <span class="sub-id">ID #{{ item.id }}</span>
                    </div>
                  </td>
                  <td><span class="tag-entidade">{{ item.entidade }}</span></td>
                  <td><span class="badge-tag" :class="badgeTipoErro(item.tipoErroCodigo)">{{ item.tipoErroCodigo }}</span></td>
                  <td class="col-motivo">
                    <div class="campo-alvo">
                      <span class="rotulo-campo-problema">Campo:</span>
                      <code class="codigo-campo-problema">{{ item.campoProblema || 'Geral' }}</code>
                    </div>
                    <div class="motivo-texto-container">
                      <p class="motivo-texto" :class="{ 'motivo-expandido': motivosExpandidos[item.entidade + '-' + item.id] }">
                        {{ item.motivoRejeicao }}
                      </p>
                      <button v-if="item.motivoRejeicao && item.motivoRejeicao.length > 95" type="button" class="btn-toggle-motivo" @click="alternarMotivoExpandido(item.entidade + '-' + item.id)">
                        {{ motivosExpandidos[item.entidade + '-' + item.id] ? '▲ Recolher' : '▼ Ver texto completo' }}
                      </button>
                    </div>
                  </td>
                  <td class="col-origem">
                    <div class="origem-fonte-nome">{{ item.fonteDadoNome || ('Fonte #' + item.fonteDadoId) }}</div>
                    <button class="badge-lote-clicavel" :title="'Filtrar quarentena pelo Lote #' + item.loteIngestaoId" @click="filtrarPorLote(item.loteIngestaoId)">
                      📁 Lote #{{ item.loteIngestaoId }}
                    </button>
                  </td>
                  <td><span class="badge-tag" :class="badgeStatus(item.statusAnaliseCodigo)">{{ item.statusAnaliseDescricao || item.statusAnaliseCodigo }}</span></td>
                  <td class="col-acao-td">
                    <button class="btn-inspecionar" @click="abrirDetalhes(item)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      <span>Inspecionar</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Barra de Paginação -->
          <div v-if="totalItens > 0" class="paginacao-container">
            <div class="paginacao-info">
              Exibindo <strong>{{ indiceInicio.toLocaleString('pt-BR') }}</strong> a <strong>{{ indiceFim.toLocaleString('pt-BR') }}</strong> de <strong>{{ totalItens.toLocaleString('pt-BR') }}</strong> registros
              <span v-if="filtroLoteId" class="paginacao-lote-tag">no Lote #{{ filtroLoteId }}</span>
            </div>

            <div class="paginacao-controles">
              <div class="paginacao-tamanho">
                <label class="rotulo-paginacao">Itens por página:</label>
                <select :value="tamanhoPagina" @change="mudarTamanhoPagina($event.target.value)" class="select-tamanho">
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                  <option :value="200">200</option>
                </select>
              </div>

              <div class="paginacao-botoes">
                <button type="button" class="btn-pag" :disabled="paginaAtual <= 1 || carregando" @click="mudarPagina(1)" title="Primeira página">««</button>
                <button type="button" class="btn-pag" :disabled="paginaAtual <= 1 || carregando" @click="mudarPagina(paginaAtual - 1)" title="Página anterior">◀ Anterior</button>
                <span class="paginacao-status">
                  Página <strong>{{ paginaAtual }}</strong> de <strong>{{ totalPaginas }}</strong>
                </span>
                <button type="button" class="btn-pag" :disabled="paginaAtual >= totalPaginas || carregando" @click="mudarPagina(paginaAtual + 1)" title="Próxima página">Próxima ▶</button>
                <button type="button" class="btn-pag" :disabled="paginaAtual >= totalPaginas || carregando" @click="mudarPagina(totalPaginas)" title="Última página">»»</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Modal de Detalhes e Correção do Operador -->
    <DetalheQuarentenaModal
      v-if="itemSelecionado"
      :item="itemSelecionado"
      @close="fecharDetalhes"
      @atualizado="handleAtualizado"
    />
  </div>
</template>

<style scoped>
.banner-sucesso-flutuante {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideDown 0.3s ease;
}

.icone-check {
  font-size: 1.1rem;
  font-weight: bold;
}

.texto-sucesso {
  flex: 1;
}

.btn-fechar-banner {
  background: transparent;
  border: none;
  color: #34d399;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
}

.btn-fechar-banner:hover {
  opacity: 0.8;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pagina-quarentena {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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

.grid-metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 1rem;
}

.card-metrica {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.15s ease;
  height: 100%;
}

.metrica-label {
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-height: 2.2rem;
  display: flex;
  align-items: flex-start;
}

.card-metrica--clicavel {
  cursor: pointer;
}

.card-metrica--clicavel:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}

.card-metrica:first-child,
.card-metrica--total {
  border-left: 5px solid #0f172a !important;
}

.card-metrica--pendente {
  border-left: 5px solid #f59e0b !important;
}

.card-metrica--analise {
  border-left: 5px solid #0ea5e9 !important;
}

.card-metrica--sucesso {
  border-left: 5px solid #16a34a !important;
}

.card-metrica--descarte {
  border-left: 5px solid #64748b !important;
}

.card-metrica:first-child .metrica-valor,
.card-metrica--total .metrica-valor {
  color: #0f172a;
}

.card-metrica--pendente .metrica-valor {
  color: #d97706;
}

.card-metrica--analise .metrica-valor {
  color: #0284c7;
}

.card-metrica--sucesso .metrica-valor {
  color: #16a34a;
}

.card-metrica--descarte .metrica-valor {
  color: #64748b;
}

.card-metrica:first-child.card-metrica--ativo,
.card-metrica--total.card-metrica--ativo {
  border-color: #0f172a !important;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.35) !important;
}

.card-metrica--pendente.card-metrica--ativo {
  border-color: #f59e0b !important;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3) !important;
}

.card-metrica--analise.card-metrica--ativo {
  border-color: #0ea5e9 !important;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3) !important;
}

.card-metrica--sucesso.card-metrica--ativo {
  border-color: #16a34a !important;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.3) !important;
}

.card-metrica--descarte.card-metrica--ativo {
  border-color: #64748b !important;
  box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.3) !important;
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

/* Estilos do Novo Banner Fino (Ofensor) */
.secao-ofensor {
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
}

.banner-ofensor {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  padding: 0.6rem 1.25rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.ofensor-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ofensor-label {
  font-size: 0.76rem;
  font-weight: 800;
  color: #9f1239;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ofensor-nome {
  font-size: 0.86rem;
  font-weight: 600;
  color: #be123c;
  font-family: var(--fonte-mono, monospace);
}

.ofensor-valor-container {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.ofensor-valor {
  font-size: 1.15rem;
  font-weight: 800;
  color: #e11d48;
}

.ofensor-sub {
  font-size: 0.7rem;
  font-weight: 700;
  color: #9f1239;
  text-transform: uppercase;
}

.card-acordeao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.acordeao-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: #ffffff;
  cursor: pointer;
  user-select: none;
}

.acordeao-header:hover {
  background: #f8fafc;
}

.acordeao-titulo {
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
  padding: 0;
}

.btn-toggle-acordeao svg {
  width: 1.1rem;
  height: 1.1rem;
  transition: transform 0.2s ease;
}

.icone-rotacionado {
  transform: rotate(180deg);
}

.acordeao-corpo {
  padding: 0 1.25rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  margin-top: 0.25rem;
  padding-top: 1.25rem;
}

.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
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

.select-filtro,
.input-filtro-lote {
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  background: #ffffff;
  color: #1e293b;
}

.input-filtro-lote { width: 90px; }
.select-filtro:focus, .input-filtro-lote:focus {
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
}

.input-busca:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.secao-diagnostico {
  margin-bottom: 0.5rem;
}

.grupo-acao-linha {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.select-acao-rapida {
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background-color: #ffffff;
  color: #334155;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
}

.mt-2 { margin-top: 0.5rem; }

.banner-filtro-lote {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 0.85rem 1.25rem;
  color: #92400e;
  font-size: 0.86rem;
  margin-bottom: 1rem;
}

.banner-lote-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge-lote-banner {
  background: #b45309;
  color: #ffffff;
  font-family: var(--fonte-mono);
  font-weight: 800;
  font-size: 0.76rem;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}

.banner-lote-acoes {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn-banner-link {
  background: #ffffff;
  border: 1px solid #fde68a;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
}

.btn-banner-link:hover {
  background: #fef3c7;
}

.btn-banner-remover {
  background: transparent;
  border: none;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.banner-erro {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 8px;
  padding: 0.85rem 1.15rem;
  font-size: 0.86rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.tabela-container {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
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
  border-bottom: 1px solid #e2e8f0;
}

.tabela-dados td {
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}

.linha-tabela:hover { background: #fcfdfe; }
.col-chave { min-width: 180px; }
.chave-wrapper { display: flex; flex-direction: column; gap: 0.2rem; }
.chave-codigo {
  font-family: var(--fonte-mono); font-size: 0.8rem; font-weight: 700;
  color: #0f172a; background: #f1f5f9; padding: 0.15rem 0.45rem; border-radius: 4px;
}
.sub-id { font-size: 0.72rem; color: #94a3b8; }
.tag-entidade {
  font-size: 0.74rem; font-weight: 700; text-transform: uppercase;
  background: #f1f5f9; color: #475569; padding: 0.2rem 0.5rem; border-radius: 4px;
}
.col-motivo { min-width: 280px; max-width: 420px; }
.campo-alvo { display: flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; }
.rotulo-campo-problema { color: #64748b; font-weight: 600; }
.codigo-campo-problema { font-family: var(--fonte-mono); background: #fef2f2; color: #991b1b; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: 700; }
.motivo-texto-container { margin-top: 0.35rem; }
.motivo-texto { font-size: 0.82rem; color: #334155; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.motivo-texto.motivo-expandido { display: block; overflow: visible; }
.col-origem { min-width: 150px; }
.origem-fonte-nome { font-weight: 600; color: #1e293b; font-size: 0.82rem; }
.badge-lote-clicavel {
  display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.25rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 0.74rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 4px; cursor: pointer;
}
.col-acao-th, .col-acao-td { text-align: right; min-width: 120px; }
.btn-inspecionar {
  display: inline-flex; align-items: center; gap: 0.35rem; background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 700; font-size: 0.78rem; padding: 0.45rem 0.85rem; border-radius: 6px; cursor: pointer;
}

.btn-inspecionar svg {
  width: 0.9rem;
  height: 0.9rem;
  color: #64748b;
}

.btn-inspecionar:hover {
  background: #15803d;
  color: #ffffff;
  border-color: #15803d;
}

.btn-inspecionar:hover svg {
  color: #ffffff;
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

.paginacao-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.25rem;
  background-color: #ffffff;
  border-top: 1px solid #f1f5f9;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  flex-wrap: wrap;
  gap: 1rem;
}

.paginacao-info {
  font-size: 0.84rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.paginacao-info strong {
  color: #0f172a;
  font-weight: 600;
}

.paginacao-lote-tag {
  background-color: #f1f5f9;
  color: #475569;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.25rem;
}

.paginacao-controles {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.paginacao-tamanho {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.rotulo-paginacao {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 500;
}

.select-tamanho {
  padding: 0.25rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.82rem;
  color: #1e293b;
  background-color: #f8fafc;
  cursor: pointer;
  outline: none;
}

.select-tamanho:focus {
  border-color: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.15);
}

.paginacao-botoes {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.btn-pag {
  padding: 0.35rem 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-pag:hover:not(:disabled) {
  background-color: #f8fafc;
  border-color: #cbd5e1;
  color: #0f172a;
}

.btn-pag:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.paginacao-status {
  font-size: 0.82rem;
  color: #475569;
  padding: 0 0.4rem;
}

.paginacao-status strong {
  color: #0f172a;
}

@media (max-width: 768px) {
  .topo-pagina {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-atualizar {
    justify-content: center;
  }

  .banner-filtro-lote {
    flex-direction: column;
    align-items: flex-start;
  }

  .paginacao-container {
    flex-direction: column;
    align-items: stretch;
    gap: 0.85rem;
  }

  .paginacao-controles {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .paginacao-botoes {
    justify-content: center;
    flex-wrap: wrap;
  }
}
</style>
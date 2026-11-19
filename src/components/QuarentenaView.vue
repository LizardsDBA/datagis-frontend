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
        <p class="etiqueta">QUALIDADE e TRIAGEM</p>
        <h1 class="titulo">Quarentena e Qualidade de Dados</h1>
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
        <span class="metrica-label">Corrigidos e Promovidos</span>
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
        <!-- Só fala em inconsistência quando a lista realmente trouxe registros; com a lista vazia vira um aviso neutro de filtro -->
        <div
          v-if="filtroLoteId && !carregando"
          class="banner-filtro-lote"
          :class="{ 'banner-filtro-lote--neutro': itensFiltrados.length === 0 }"
        >
          <div class="banner-lote-info">
            <span class="badge-lote-banner">LOTE #{{ filtroLoteId }}</span>
            <span v-if="itensFiltrados.length > 0">
              Estes são os problemas encontrados no <strong>Lote #{{ filtroLoteId }}</strong>. Enquanto eles não forem resolvidos,
              <strong>nenhum registro do lote vai para a Silver</strong>.
            </span>
            <span v-else>
              Mostrando apenas o <strong>Lote #{{ filtroLoteId }}</strong>.
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
                  <th>Campo e Motivo da Rejeição</th>
                  <th>Origem e Lote</th>
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
                      Lote #{{ item.loteIngestaoId }}
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

<style scoped src="../styles/views/QuarentenaView.css"></style>

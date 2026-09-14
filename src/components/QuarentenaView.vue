<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  buscarItensQuarentena,
  buscarMetricasQuarentena,
  buscarTiposErro,
  buscarStatusAnalise,
} from '../services/quarentenaService'
import DetalheQuarentenaModal from './DetalheQuarentenaModal.vue'

const route = useRoute()
const router = useRouter()

const itens = ref([])
const metricas = ref(null)
const tiposErro = ref([])
const statusLista = ref([])
const carregando = ref(false)
const erro = ref(null)

// Filtros
const filtroEntidade = ref('todas')
const filtroStatus = ref(route.query.loteId ? 'todos' : 'PENDENTE')
const filtroTipoErro = ref('todos')
const filtroBusca = ref('')
const filtroLoteId = ref(route.query.loteId ? String(route.query.loteId) : '')

function selecionarFiltroStatus(st) {
  filtroStatus.value = st
  aplicarFiltros()
}

// Modal de detalhes
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
        pagina: 0,
        tamanho: 50,
      }),
      buscarTiposErro(),
      buscarStatusAnalise(),
    ])
    metricas.value = met
    itens.value = itensRes
    tiposErro.value = errRes
    statusLista.value = stRes
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar dados da quarentena'
  } finally {
    carregando.value = false
  }
}

async function aplicarFiltros() {
  carregando.value = true
  erro.value = null
  try {
    itens.value = await buscarItensQuarentena({
      entidade: filtroEntidade.value,
      status: filtroStatus.value,
      tipoErro: filtroTipoErro.value,
      loteIngestaoId: filtroLoteId.value ? Number(filtroLoteId.value) : undefined,
      pagina: 0,
      tamanho: 50,
    })
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function filtrarPorLote(id) {
  filtroLoteId.value = String(id)
  router.replace({ query: { loteId: id } })
  aplicarFiltros()
}

function removerFiltroLote() {
  filtroLoteId.value = ''
  router.replace({ query: {} })
  aplicarFiltros()
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
  if (!tipo) return 'badge--padrao'
  if (tipo.includes('GEOMETRIA') || tipo.includes('TERRITORIAL')) return 'badge--espacial'
  if (tipo.includes('CPF') || tipo.includes('DOMINIO') || tipo.includes('REFERENCIA')) return 'badge--negocio'
  if (tipo.includes('REGRESSAO')) return 'badge--regressao'
  return 'badge--padrao'
}

function badgeStatus(status) {
  if (status === 'PENDENTE') return 'status--pendente'
  if (status === 'EM_ANALISE') return 'status--analise'
  if (status === 'CORRIGIDO_REPROCESSADO') return 'status--sucesso'
  if (status === 'DESCARTADO') return 'status--descartado'
  return ''
}

onMounted(() => {
  carregarTudo()
})
</script>

<template>
  <div class="pagina-quarentena">
    <!-- Cabeçalho Principal -->
    <header class="topo-pagina">
      <div>
        <h1 class="titulo">Quarentena & Qualidade de Dados</h1>
        <p class="subtitulo">
          Triagem e auditoria de registros retidos antes da promoção para a camada Silver
        </p>
      </div>
      <button class="btn-atualizar" @click="carregarTudo" :disabled="carregando">
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
    <section v-if="metricas" class="grid-metricas">
      <div
        class="card-metrica card-metrica--clicavel"
        :class="{ 'card-metrica--ativo': filtroStatus === 'todos' }"
        @click="selecionarFiltroStatus('todos')"
        title="Clique para ver todos os registros da quarentena"
      >
        <span class="metrica-label">Total Retido</span>
        <span class="metrica-valor">{{ metricas.totalRegistros }}</span>
        <span class="metrica-sub">Todos os registros</span>
      </div>

      <div
        class="card-metrica card-metrica--pendente card-metrica--clicavel"
        :class="{ 'card-metrica--ativo': filtroStatus === 'PENDENTE' }"
        @click="selecionarFiltroStatus('PENDENTE')"
        title="Clique para filtrar pendentes de análise"
      >
        <span class="metrica-label">Pendentes de Análise</span>
        <span class="metrica-valor">{{ metricas.totalPendentes }}</span>
        <span class="metrica-sub">Aguardando operador (RN007)</span>
      </div>

      <div
        class="card-metrica card-metrica--analise card-metrica--clicavel"
        :class="{ 'card-metrica--ativo': filtroStatus === 'EM_ANALISE' }"
        @click="selecionarFiltroStatus('EM_ANALISE')"
        title="Clique para filtrar em análise"
      >
        <span class="metrica-label">Em Análise</span>
        <span class="metrica-valor">{{ metricas.totalEmAnalise }}</span>
        <span class="metrica-sub">Em tratamento ativo</span>
      </div>

      <div
        class="card-metrica card-metrica--sucesso card-metrica--clicavel"
        :class="{ 'card-metrica--ativo': filtroStatus === 'CORRIGIDO_REPROCESSADO' }"
        @click="selecionarFiltroStatus('CORRIGIDO_REPROCESSADO')"
        title="Clique para filtrar corrigidos & promovidos"
      >
        <span class="metrica-label">Corrigidos & Promovidos</span>
        <span class="metrica-valor">{{ metricas.totalCorrigidos }}</span>
        <span class="metrica-sub">Liberados para Silver</span>
      </div>

      <div
        class="card-metrica card-metrica--descarte card-metrica--clicavel"
        :class="{ 'card-metrica--ativo': filtroStatus === 'DESCARTADO' }"
        @click="selecionarFiltroStatus('DESCARTADO')"
        title="Clique para filtrar descartados"
      >
        <span class="metrica-label">Descartados</span>
        <span class="metrica-valor">{{ metricas.totalDescartados }}</span>
        <span class="metrica-sub">Registros irrecuperáveis</span>
      </div>
    </section>

    <!-- Barra de Filtros e Busca -->
    <section class="barra-filtros">
      <div class="grupo-campo">
        <label class="rotulo-filtro">Entidade Silver:</label>
        <select v-model="filtroEntidade" @change="aplicarFiltros" class="select-filtro">
          <option v-for="ent in entidadesDisponiveis" :key="ent.valor" :value="ent.valor">
            {{ ent.label }}
          </option>
        </select>
      </div>

      <div class="grupo-campo">
        <label class="rotulo-filtro">Status:</label>
        <select v-model="filtroStatus" @change="aplicarFiltros" class="select-filtro">
          <option value="todos">Todos os Status</option>
          <option v-for="st in statusLista" :key="st.codigo" :value="st.codigo">
            {{ st.descricao }}
          </option>
        </select>
      </div>

      <div class="grupo-campo">
        <label class="rotulo-filtro">Tipo de Erro:</label>
        <select v-model="filtroTipoErro" @change="aplicarFiltros" class="select-filtro">
          <option value="todos">Todos os Tipos</option>
          <option v-for="te in tiposErro" :key="te.codigo" :value="te.codigo">
            {{ te.codigo }}
          </option>
        </select>
      </div>

      <div class="grupo-campo grupo-campo--lote">
        <label class="rotulo-filtro">Lote ID:</label>
        <input
          v-model="filtroLoteId"
          type="number"
          placeholder="Ex: 1"
          class="input-filtro-lote"
          @change="aplicarFiltros"
        />
      </div>

      <div class="grupo-campo grupo-campo--busca">
        <label class="rotulo-filtro">Buscar por texto:</label>
        <input
          v-model="filtroBusca"
          type="text"
          placeholder="Chave, campo ou motivo..."
          class="input-busca"
        />
      </div>
    </section>

    <!-- Banner de Filtro por Lote Ativo -->
    <div v-if="filtroLoteId" class="banner-filtro-lote">
      <div class="banner-lote-info">
        <span class="badge-lote-banner">LOTE #{{ filtroLoteId }}</span>
        <span>
          Filtrando inconsistências do <strong>Lote #{{ filtroLoteId }}</strong>.
          Pela regra de integridade total, este lote está retido e <strong>0 registros foram para a Silver</strong>.
        </span>
      </div>
      <div class="banner-lote-acoes">
        <button class="btn-banner-link" @click="router.push('/lotes')">Ver no Pipeline</button>
        <button class="btn-banner-remover" @click="removerFiltroLote">Limpar filtro de lote ✕</button>
      </div>
    </div>

    <!-- Estado de Erro -->
    <div v-if="erro" class="banner-erro">
      {{ erro }}
    </div>

    <!-- Tabela de Itens em Quarentena -->
    <section class="tabela-container">
      <div v-if="carregando" class="estado-carregando">
        <div class="spinner"></div>
        <span>Consultando registros da quarentena...</span>
      </div>

      <div v-else-if="itensFiltrados.length === 0" class="estado-vazio">
        <svg class="icone-vazio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <h3>Nenhuma inconsistência encontrada</h3>
        <p>Nenhum registro retido atende aos filtros aplicados no momento.</p>
      </div>

      <table v-else class="tabela-dados">
        <thead>
          <tr>
            <th>Chave Natural / ID</th>
            <th>Entidade</th>
            <th>Tipo de Erro</th>
            <th>Campo / Motivo</th>
            <th>Origem & Lote</th>
            <th>Status</th>
            <th class="col-acao">Ação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in itensFiltrados" :key="item.entidade + '-' + item.id" class="linha-tabela">
            <td class="col-chave">
              <span class="chave-texto">{{ item.chaveIdentificacao }}</span>
              <span class="sub-id">#{{ item.id }}</span>
            </td>
            <td>
              <span class="tag-entidade-sm">{{ item.entidade }}</span>
            </td>
            <td>
              <span :class="['badge-erro', badgeTipoErro(item.tipoErroCodigo)]">
                {{ item.tipoErroCodigo }}
              </span>
            </td>
            <td class="col-motivo">
              <div class="campo-alvo">Campo: <strong>{{ item.campoProblema || 'Geral' }}</strong></div>
              <div class="motivo-texto" :title="item.motivoRejeicao">{{ item.motivoRejeicao }}</div>
            </td>
            <td class="col-origem">
              <div>{{ item.fonteDadoNome || ('Fonte #' + item.fonteDadoId) }}</div>
              <button
                class="badge-lote-clicavel"
                :title="'Filtrar quarentena pelo Lote #' + item.loteIngestaoId"
                @click="filtrarPorLote(item.loteIngestaoId)"
              >
                #Lote {{ item.loteIngestaoId }}
              </button>
            </td>
            <td>
              <span :class="['badge-status', badgeStatus(item.statusAnaliseCodigo)]">
                {{ item.statusAnaliseDescricao || item.statusAnaliseCodigo }}
              </span>
            </td>
            <td class="col-acao">
              <button class="btn-inspecionar" @click="abrirDetalhes(item)">
                Inspecionar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Modal de Detalhes e Correção do Operador -->
    <DetalheQuarentenaModal
      v-if="itemSelecionado"
      :item="itemSelecionado"
      @close="fecharDetalhes"
      @atualizado="carregarTudo"
    />
  </div>
</template>

<style scoped>
.pagina-quarentena {
  padding: 2rem;
  max-width: 80rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
}

.subtitulo {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  color: #64748b;
}

.btn-atualizar {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.5rem 0.85rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.btn-atualizar:hover {
  background: #f8fafc;
}

.icone-btn {
  width: 1rem;
  height: 1rem;
}

/* Métricas */
.grid-metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 1rem;
}

.card-metrica {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.metrica-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
}

.metrica-valor {
  font-size: 1.85rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0.2rem 0;
}

.metrica-sub {
  font-size: 0.75rem;
  color: #94a3b8;
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
.card-metrica--clicavel {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card-metrica--clicavel:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}
.card-metrica--ativo {
  border-color: #0284c7 !important;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.25) !important;
}

/* Barra de Filtros */
.barra-filtros {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}

.grupo-campo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.grupo-campo--busca {
  flex: 1;
  min-width: 14rem;
}

.rotulo-filtro {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.select-filtro,
.input-busca {
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #1e293b;
  background: #f8fafc;
}
.select-filtro:focus,
.input-busca:focus {
  outline: none;
  border-color: #2e7d32;
  background: #ffffff;
}

/* Tabela */
.tabela-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tabela-dados td {
  padding: 0.9rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.linha-tabela:hover {
  background: #f8fafc;
}

.col-chave {
  display: flex;
  flex-direction: column;
}

.chave-texto {
  font-weight: 700;
  color: #0f172a;
}

.sub-id {
  font-size: 0.75rem;
  color: #94a3b8;
}

.tag-entidade-sm {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  background: #f1f5f9;
  color: #475569;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
}

.col-motivo {
  max-width: 20rem;
}

.campo-alvo {
  font-size: 0.78rem;
  color: #475569;
}

.motivo-texto {
  font-size: 0.82rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-origem {
  font-size: 0.82rem;
  color: #334155;
}

.texto-apagado {
  color: #94a3b8;
}

.badge-erro {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
}
.badge--espacial {
  background: #ede9fe;
  color: #6d28d9;
}
.badge--negocio {
  background: #fef3c7;
  color: #b45309;
}
.badge--regressao {
  background: #fee2e2;
  color: #b91c1c;
}
.badge--padrao {
  background: #f1f5f9;
  color: #475569;
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
}
.status--pendente {
  background: #fef3c7;
  color: #b45309;
}
.status--analise {
  background: #e0f2fe;
  color: #0369a1;
}
.status--sucesso {
  background: #dcfce7;
  color: #15803d;
}
.status--descartado {
  background: #f1f5f9;
  color: #64748b;
}

.col-acao {
  text-align: right;
}

.btn-inspecionar {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-weight: 600;
  font-size: 0.8rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-inspecionar:hover {
  background: #2e7d32;
  color: #ffffff;
  border-color: #2e7d32;
}

.estado-carregando,
.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 1rem;
  color: #64748b;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e2e8f0;
  border-top-color: #2e7d32;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 0.75rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.icone-vazio {
  width: 3rem;
  height: 3rem;
  color: #16a34a;
  margin-bottom: 0.5rem;
}

.banner-erro {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
}

.grupo-campo--lote {
  width: 90px;
}

.input-filtro-lote {
  padding: 0.55rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 0.85rem;
  outline: none;
  background: #ffffff;
  width: 100%;
  box-sizing: border-box;
}

.banner-filtro-lote {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 0.85rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  font-size: 0.85rem;
  color: #92400e;
}

.banner-lote-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge-lote-banner {
  background: #f59e0b;
  color: #ffffff;
  font-weight: 800;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.banner-lote-acoes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-banner-link {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.btn-banner-link:hover {
  background: #f1f5f9;
}

.btn-banner-remover {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #991b1b;
  cursor: pointer;
}

.btn-banner-remover:hover {
  background: #fee2e2;
}

.badge-lote-clicavel {
  display: inline-block;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  margin-top: 0.2rem;
}

.badge-lote-clicavel:hover {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}
</style>

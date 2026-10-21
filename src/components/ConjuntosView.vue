<script setup>
import { ref, onMounted, onUnmounted, nextTick, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { buscarConjuntos, criarConjunto, buscarFontes } from '../services/conjuntoService'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Quem so visualiza (ex.: Auditor) ve conjuntos e mapa, sem o formulario (LIZARDS-46)
const podeGerenciar = temPermissao(PERMISSOES.CONJUNTO_GERENCIAR)

// Fix Leaflet default icon paths (problema comum com bundlers)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Estado global ──────────────────────────────────────────────────────────────
const conjuntos       = ref([])
const fontes          = ref([])
const carregando      = ref(false)
const enviando        = ref(false)
const erro            = ref(null)
const erroForm        = ref(null)
const sucesso         = ref(null)
const conjuntoDestaque = ref(null)

// ── Formulário ─────────────────────────────────────────────────────────────────
const form = ref({
  fonteDadoId: '',
  competencia: '',
  statusCamada: 'ATIVA',
})

const statusOpcoes = [
  { valor: 'ATIVA',        label: 'Ativa',        cor: 'status--ativa' },
  { valor: 'INATIVA',      label: 'Inativa',      cor: 'status--inativa' },
  { valor: 'PROCESSANDO',  label: 'Processando',  cor: 'status--processando' },
  { valor: 'ERRO',         label: 'Erro',         cor: 'status--erro' },
]

function badgeStatus(status) {
  return statusOpcoes.find(s => s.valor === status)?.cor || 'status--inativa'
}

function labelStatus(status) {
  return statusOpcoes.find(s => s.valor === status)?.label || status
}

// ── Mapa Leaflet ───────────────────────────────────────────────────────────────
const mapaEl     = ref(null)
const mapa       = shallowRef(null)
const camadasGeo = shallowRef({})   // conjuntoId → L.Layer

const ESTILO_PADRAO = {
  color:       '#15803d',
  weight:      2,
  opacity:     0.85,
  fillColor:   '#22c55e',
  fillOpacity: 0.18,
}
const ESTILO_DESTAQUE = {
  color:       '#d97706',
  weight:      3,
  opacity:     1,
  fillColor:   '#fbbf24',
  fillOpacity: 0.35,
}

function iniciarMapa() {
  if (mapa.value || !mapaEl.value) return

  mapa.value = L.map(mapaEl.value, {
    center: [-14.235, -51.925],
    zoom: 4,
    zoomControl: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapa.value)
}

/**
 * Converte o valor de coberturaTerritorial que chega do back-end.
 * A API retorna GeoJSON; preservamos também coleções com o campo geometries.
 */
function geometriaParaGeoJson(geo) {
  if (!geo) return null
  // Se já for string, tenta parsear
  if (typeof geo === 'string') {
    try { return JSON.parse(geo) } catch { return null }
  }
  if (geo.type) return geo
  // Se for objeto JTS-like com geometryType
  if (geo.geometryType || geo.type) {
    const tipo = (geo.geometryType || geo.type || '').toLowerCase()
    // Normaliza para GeoJSON
    return {
      type: normalizeGeoJsonType(geo.geometryType || geo.type),
      coordinates: geo.coordinates,
    }
  }
  return null
}

function normalizeGeoJsonType(t) {
  if (!t) return 'Polygon'
  const map = {
    polygon:            'Polygon',
    multipolygon:       'MultiPolygon',
    point:              'Point',
    multipoint:         'MultiPoint',
    linestring:         'LineString',
    multilinestring:    'MultiLineString',
    geometrycollection: 'GeometryCollection',
  }
  return map[t.toLowerCase()] || t
}

function renderizarConjuntosNoMapa() {
  if (!mapa.value) return

  // Remove camadas antigas
  Object.values(camadasGeo.value).forEach(l => mapa.value.removeLayer(l))
  camadasGeo.value = {}

  const bounds = []

  conjuntos.value.forEach(c => {
    const geoJson = geometriaParaGeoJson(c.coberturaTerritorial)
    if (!geoJson) return

    try {
      const layer = L.geoJSON(geoJson, {
        style: c.id === conjuntoDestaque.value ? ESTILO_DESTAQUE : ESTILO_PADRAO,
      })
      layer.bindTooltip(
        `<strong>${c.fonteDadoNome || 'Fonte #' + c.fonteDadoId}</strong><br/>` +
        `Competência: ${formatarCompetencia(c.competencia)}<br/>` +
        `Status: ${labelStatus(c.statusCamada)}`,
        { sticky: true }
      )
      layer.on('click', () => destacarConjunto(c.id))
      layer.addTo(mapa.value)
      camadasGeo.value[c.id] = layer

      // Coleta bounds para ajuste de zoom
      try {
        const b = layer.getBounds()
        if (b.isValid()) bounds.push(b)
      } catch {}
    } catch (e) {
      console.warn('Erro ao renderizar geometria do conjunto #' + c.id, e)
    }
  })

  if (bounds.length > 0) {
    const combinado = bounds.reduce((acc, b) => acc.extend(b), bounds[0])
    mapa.value.fitBounds(combinado, { padding: [32, 32] })
  }
}

function destacarConjunto(id) {
  conjuntoDestaque.value = id

  Object.entries(camadasGeo.value).forEach(([cid, layer]) => {
    if (layer.setStyle) {
      layer.setStyle(Number(cid) === id ? ESTILO_DESTAQUE : ESTILO_PADRAO)
    }
  })

  const camada = camadasGeo.value[id]
  if (camada) {
    try {
      mapa.value.fitBounds(camada.getBounds(), { padding: [48, 48] })
    } catch {}
  }
}

// ── Carregamento de dados ──────────────────────────────────────────────────────
async function carregarTudo() {
  carregando.value = true
  erro.value = null
  try {
    const [conjs, fts] = await Promise.all([buscarConjuntos(), buscarFontes()])
    conjuntos.value = conjs
    fontes.value    = fts
    await nextTick()
    renderizarConjuntosNoMapa()
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar dados'
  } finally {
    carregando.value = false
  }
}

// ── Submissão do formulário ────────────────────────────────────────────────────
async function submeter() {
  erroForm.value = null
  sucesso.value  = null

  if (!form.value.fonteDadoId) { erroForm.value = 'Selecione uma fonte de dados.'; return }
  if (!form.value.competencia) { erroForm.value = 'Informe a competência (mês/ano).'; return }

  enviando.value = true
  try {
    // Converte "YYYY-MM" para "YYYY-MM-DD" (primeiro dia do mês) exigido pelo LocalDate
    const competenciaDate = form.value.competencia + '-01'

    await criarConjunto({
      fonteDadoId:         Number(form.value.fonteDadoId),
      competencia:         competenciaDate,
      statusCamada:        form.value.statusCamada,
      coberturaTerritorial: null, // campo opcional; back-end aceita null
    })

    sucesso.value = 'Conjunto cadastrado com sucesso!'
    form.value = { fonteDadoId: '', competencia: '', statusCamada: 'ATIVA' }

    // Recarrega lista e atualiza mapa
    await carregarTudo()

    setTimeout(() => { sucesso.value = null }, 4000)
  } catch (e) {
    erroForm.value = e.message || 'Erro ao cadastrar conjunto.'
  } finally {
    enviando.value = false
  }
}

function formatarCompetencia(val) {
  if (!val) return '—'
  // val pode ser "YYYY-MM-DD" ou "YYYY-MM"
  const partes = String(val).split('-')
  if (partes.length >= 2) {
    return `${partes[1]}/${partes[0]}`
  }
  return val
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await nextTick()
  iniciarMapa()
  await carregarTudo()
})

onUnmounted(() => {
  if (mapa.value) {
    mapa.value.remove()
    mapa.value = null
  }
})
</script>

<template>
  <div class="pagina-conjuntos">

    <!-- Cabeçalho -->
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">CAMADA SILVER</p>
        <h1 class="titulo">Conjuntos e Cobertura Territorial</h1>
        <p class="subtitulo">
          Cadastre conjuntos de dados associados a fontes e visualize a área de cobertura geoespacial no mapa.
        </p>
      </div>
      <button class="btn-atualizar" @click="carregarTudo" :disabled="carregando" title="Recarregar">
        <svg class="icone-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <span>Atualizar</span>
      </button>
    </header>

    <!-- Erro global -->
    <div v-if="erro" class="banner-erro">✕ {{ erro }}</div>

    <!-- Layout principal: painel esquerdo + mapa direito -->
    <div class="layout-principal">

      <!-- ── Painel esquerdo ── -->
      <aside class="painel-lateral">

        <!-- Formulário de cadastro -->
        <section v-if="podeGerenciar" class="card-form">
          <div class="card-form-cabecalho">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="card-form-icone">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <h2 class="card-form-titulo">Novo Conjunto</h2>
          </div>

          <form @submit.prevent="submeter" class="formulario" novalidate>

            <!-- Fonte de dados -->
            <div class="grupo-campo">
              <label class="rotulo" for="select-fonte">Fonte de Dados *</label>
              <div class="select-wrapper">
                <select
                  id="select-fonte"
                  v-model="form.fonteDadoId"
                  class="input-campo"
                  :disabled="enviando || carregando"
                >
                  <option value="" disabled>
                    {{ carregando ? 'Carregando fontes...' : 'Selecione uma fonte...' }}
                  </option>
                  <option v-for="f in fontes" :key="f.id" :value="f.id">
                    {{ f.nome }}{{ f.orgao ? ' — ' + f.orgao : '' }}
                  </option>
                </select>
                <svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            <!-- Competência -->
            <div class="grupo-campo">
              <label class="rotulo" for="input-competencia">Competência (Mês/Ano) *</label>
              <input
                id="input-competencia"
                type="month"
                v-model="form.competencia"
                class="input-campo"
                :disabled="enviando"
              />
            </div>

            <!-- Status da Camada -->
            <div class="grupo-campo">
              <label class="rotulo">Status da Camada *</label>
              <div class="radio-grupo">
                <label
                  v-for="op in statusOpcoes"
                  :key="op.valor"
                  class="radio-item"
                  :class="{ 'radio-item--selecionado': form.statusCamada === op.valor }"
                >
                  <input
                    type="radio"
                    :value="op.valor"
                    v-model="form.statusCamada"
                    :disabled="enviando"
                    class="radio-input"
                  />
                  <span class="badge-status" :class="op.cor">{{ op.label }}</span>
                </label>
              </div>
            </div>

            <!-- Info sobre geometria -->
            <div class="info-geo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-geo-icone">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                A cobertura territorial será exibida no mapa quando informada pelo sistema via banco de dados.
              </span>
            </div>

            <!-- Feedback do formulário -->
            <div v-if="erroForm" class="alerta-form alerta-form--erro">✕ {{ erroForm }}</div>
            <div v-if="sucesso" class="alerta-form alerta-form--sucesso">✔ {{ sucesso }}</div>

            <button
              type="submit"
              class="btn-cadastrar"
              :disabled="enviando || carregando"
            >
              <svg v-if="!enviando" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icone">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span class="spinner-mini" v-else></span>
              {{ enviando ? 'Cadastrando...' : 'Cadastrar Conjunto' }}
            </button>
          </form>
        </section>

        <!-- Tabela de conjuntos -->
        <section class="card-lista">
          <div class="card-lista-cabecalho">
            <h2 class="card-lista-titulo">Conjuntos Cadastrados</h2>
            <span class="badge-contagem">{{ conjuntos.length }}</span>
          </div>

          <div v-if="carregando" class="estado-carregando">
            <div class="spinner"></div>
            <span>Carregando...</span>
          </div>

          <div v-else-if="conjuntos.length === 0" class="estado-vazio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p>Nenhum conjunto cadastrado ainda.</p>
          </div>

          <div v-else class="lista-conjuntos">
            <div
              v-for="c in conjuntos"
              :key="c.id"
              class="item-conjunto"
              :class="{ 'item-conjunto--destaque': conjuntoDestaque === c.id }"
              @click="destacarConjunto(c.id)"
              role="button"
              :title="'Ver no mapa: ' + (c.fonteDadoNome || 'Fonte #' + c.fonteDadoId)"
            >
              <div class="item-conjunto-topo">
                <div class="item-conjunto-info">
                  <span class="item-id">ID #{{ c.id }}</span>
                  <span class="item-fonte">{{ c.fonteDadoNome || 'Fonte #' + c.fonteDadoId }}</span>
                </div>
                <span class="badge-status" :class="badgeStatus(c.statusCamada)">
                  {{ labelStatus(c.statusCamada) }}
                </span>
              </div>
              <div class="item-conjunto-rodape">
                <span class="item-competencia">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icone">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {{ formatarCompetencia(c.competencia) }}
                </span>
                <span class="item-geo" :class="c.coberturaTerritorial ? 'item-geo--sim' : 'item-geo--nao'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icone">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  {{ c.coberturaTerritorial ? 'Com geometria' : 'Sem geometria' }}
                </span>
              </div>
            </div>
          </div>
        </section>

      </aside>

      <!-- ── Mapa Leaflet ── -->
      <div class="painel-mapa">
        <div class="mapa-topo">
          <div class="mapa-legenda">
            <span class="legenda-item legenda-item--padrao">Cobertura</span>
            <span class="legenda-item legenda-item--destaque">Selecionado</span>
          </div>
          <span class="mapa-dica">Clique em um conjunto para destacar no mapa</span>
        </div>
        <div ref="mapaEl" id="mapa-leaflet" class="mapa-container"></div>
        <div v-if="conjuntos.filter(c => c.coberturaTerritorial).length === 0 && !carregando" class="mapa-overlay-aviso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p>Nenhum conjunto com cobertura territorial definida. Os polígonos aparecerão aqui assim que informados.</p>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Estrutura ─────────────────────────────────────────────────────────────── */
.pagina-conjuntos {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
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
  margin: 0 0 0.25rem;
  font-size: 1.65rem;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.subtitulo {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 52rem;
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
.btn-atualizar:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }

.icone-btn { width: 1rem; height: 1rem; }

.banner-erro {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 8px;
  padding: 0.85rem 1.15rem;
  font-size: 0.86rem;
  font-weight: 600;
}

/* ── Layout principal ──────────────────────────────────────────────────────── */
.layout-principal {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
  align-items: flex-start;
}

/* ── Painel lateral (formulário + lista) ───────────────────────────────────── */
.painel-lateral {
  width: 26rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: calc(100vh - 13rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

/* ── Card Formulário ───────────────────────────────────────────────────────── */
.card-form {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.card-form-cabecalho {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.card-form-icone {
  width: 1.25rem;
  height: 1.25rem;
  color: #15803d;
}

.card-form-titulo {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.formulario {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.grupo-campo {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.rotulo {
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
}

.select-wrapper {
  position: relative;
}

.input-campo {
  width: 100%;
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  background: #ffffff;
  color: #1e293b;
  transition: border-color 0.15s, box-shadow 0.15s;
  appearance: none;
  box-sizing: border-box;
}

.input-campo:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.input-campo:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }

.select-chevron {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  color: #64748b;
  pointer-events: none;
}

/* Radio group de Status */
.radio-grupo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.35rem 0.65rem;
  transition: all 0.15s ease;
}

.radio-item:hover { border-color: #cbd5e1; background: #f8fafc; }

.radio-item--selecionado {
  border-color: #15803d;
  background: #f0fdf4;
}

.radio-input { display: none; }

/* Info geometria */
.info-geo {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  color: #0369a1;
  font-size: 0.78rem;
  line-height: 1.5;
}

.info-geo-icone { width: 1rem; height: 1rem; flex-shrink: 0; margin-top: 0.05rem; }

/* Alertas do formulário */
.alerta-form {
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  font-size: 0.83rem;
  font-weight: 600;
}
.alerta-form--erro   { background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; }
.alerta-form--sucesso { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

/* Botão cadastrar */
.btn-cadastrar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 6px rgba(21, 128, 61, 0.3);
  letter-spacing: 0.01em;
}
.btn-cadastrar:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(21, 128, 61, 0.4);
}
.btn-cadastrar:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.btn-icone { width: 1rem; height: 1rem; }

/* ── Card Lista ────────────────────────────────────────────────────────────── */
.card-lista {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.card-lista-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.card-lista-titulo {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.badge-contagem {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 99px;
}

.lista-conjuntos {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.item-conjunto {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.85rem 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.item-conjunto:hover { border-color: #a7f3d0; background: #f0fdf4; }
.item-conjunto--destaque {
  border-color: #d97706 !important;
  background: #fffbeb !important;
  box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.2);
}

.item-conjunto-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.item-conjunto-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.item-id {
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  font-family: monospace;
}

.item-fonte {
  font-size: 0.85rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.3;
}

.item-conjunto-rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.item-competencia, .item-geo {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
}

.item-geo--sim { color: #15803d; }
.item-geo--nao { color: #94a3b8; }

.mini-icone { width: 0.8rem; height: 0.8rem; }

/* ── Badges de Status ──────────────────────────────────────────────────────── */
.badge-status {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.22rem 0.6rem;
  border-radius: 99px;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status--ativa       { background: #dcfce7; color: #166534; }
.status--inativa     { background: #f1f5f9; color: #475569; }
.status--processando { background: #dbeafe; color: #1e40af; }
.status--erro        { background: #fee2e2; color: #991b1b; }

/* ── Mapa ──────────────────────────────────────────────────────────────────── */
.painel-mapa {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  min-height: 520px;
  position: relative;
  background: #f8fafc;
}

.mapa-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  gap: 1rem;
  flex-wrap: wrap;
}

.mapa-legenda {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.legenda-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.76rem;
  font-weight: 600;
  color: #475569;
}

.legenda-item::before {
  content: '';
  display: block;
  width: 14px;
  height: 10px;
  border-radius: 3px;
  border: 2px solid;
}

.legenda-item--padrao::before  { background: rgba(34, 197, 94, 0.18); border-color: #15803d; }
.legenda-item--destaque::before { background: rgba(251, 191, 36, 0.35); border-color: #d97706; }

.mapa-dica {
  font-size: 0.76rem;
  color: #94a3b8;
  font-style: italic;
}

.mapa-container {
  flex: 1;
  min-height: 460px;
  z-index: 0;
}

.mapa-overlay-aviso {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.85rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  max-width: 22rem;
  text-align: left;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 500;
  pointer-events: none;
}

.mapa-overlay-aviso svg {
  width: 1.5rem;
  height: 1.5rem;
  color: #94a3b8;
  flex-shrink: 0;
}

.mapa-overlay-aviso p {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.5;
}

/* ── Spinners ──────────────────────────────────────────────────────────────── */
.estado-carregando {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: #64748b;
  font-size: 0.86rem;
}

.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.86rem;
}

.estado-vazio svg { width: 2.5rem; height: 2.5rem; }

.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #e2e8f0;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinner-mini {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Responsivo ────────────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .layout-principal {
    flex-direction: column;
  }
  .painel-lateral {
    width: 100%;
    max-height: none;
  }
  .painel-mapa {
    min-height: 420px;
  }
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

:root[data-tema="escuro"] .btn-atualizar {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .btn-atualizar:hover:not(:disabled) {
  background: var(--cor-borda);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .banner-erro {
  background: var(--tenue-erro);
  border-color: rgb(248 113 113 / 30%);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .painel-lateral {
  scrollbar-color: var(--cor-borda-forte) transparent;
}

:root[data-tema="escuro"] .card-form {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .card-form-icone {
  color: var(--cor-link);
}

:root[data-tema="escuro"] .card-form-titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .rotulo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .input-campo {
  border-color: var(--cor-borda-forte);
  background: var(--cor-superficie);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .input-campo:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .input-campo:disabled {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .select-chevron {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .radio-item {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .radio-item:hover {
  border-color: var(--cor-borda-forte);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .radio-item--selecionado {
  border-color: var(--cor-primaria);
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .info-geo {
  background: var(--tenue-info);
  border-color: rgb(124 180 247 / 30%);
  color: var(--cor-info);
}

:root[data-tema="escuro"] .alerta-form--erro {
  background: var(--tenue-erro);
  border-color: rgb(248 113 113 / 30%);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .alerta-form--sucesso {
  background: var(--cor-primaria-tenue);
  border-color: var(--cor-primaria-borda);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .btn-cadastrar {
  background: linear-gradient(135deg, var(--cor-primaria), var(--cor-primaria));
  color: var(--cor-primaria-contraste);
  box-shadow: none;
}

:root[data-tema="escuro"] .btn-cadastrar:hover:not(:disabled) {
  box-shadow: none;
}

:root[data-tema="escuro"] .card-lista {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .card-lista-titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .badge-contagem {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .item-conjunto {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .item-conjunto:hover {
  border-color: var(--cor-primaria-borda);
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .item-conjunto--destaque {
  border-color: var(--cor-alerta);
  background: var(--tenue-alerta);
  box-shadow: none;
}

:root[data-tema="escuro"] .item-id {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .item-fonte {
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .item-competencia,
:root[data-tema="escuro"] .item-geo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .item-geo--sim {
  color: var(--cor-link);
}

:root[data-tema="escuro"] .item-geo--nao {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .status--ativa {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .status--inativa {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .status--processando {
  background: var(--tenue-info);
  color: var(--cor-info);
}

:root[data-tema="escuro"] .status--erro {
  background: var(--tenue-erro);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .painel-mapa {
  border-color: var(--cor-borda);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .mapa-topo {
  background: var(--cor-superficie);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .legenda-item {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .legenda-item--padrao::before {
  background: var(--tenue-sucesso);
  border-color: var(--cor-primaria);
}

:root[data-tema="escuro"] .legenda-item--destaque::before {
  background: var(--tenue-alerta);
  border-color: var(--cor-alerta);
}

:root[data-tema="escuro"] .mapa-dica {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .mapa-overlay-aviso {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .mapa-overlay-aviso svg {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .mapa-overlay-aviso p {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .estado-carregando {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .estado-vazio {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .spinner {
  border-color: var(--cor-borda);
  border-top-color: var(--cor-primaria);
}

/* Mapa (LIZARDS-38): continua o mesmo OpenStreetMap; no escuro só a camada de fundo
   (.leaflet-tile-pane) é escurecida por filtro. Os polígonos ficam em outra camada
   (.leaflet-overlay-pane) e mantêm as cores. Os elementos do Leaflet são criados por
   JavaScript, sem a marca de escopo do Vue, por isso o :deep() a partir do container. */
:root[data-tema="escuro"] .mapa-container {
  background: var(--cor-fundo);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-tile-pane) {
  filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-bar) {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-bar a) {
  background-color: var(--cor-superficie-elevada);
  border-bottom-color: var(--cor-borda);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-bar a:hover) {
  background-color: var(--cor-borda);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-control-attribution) {
  background: rgb(21 28 36 / 80%);
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-control-attribution a) {
  color: var(--cor-link);
}

:root[data-tema="escuro"] .mapa-container :deep(.leaflet-popup-content-wrapper),
:root[data-tema="escuro"] .mapa-container :deep(.leaflet-popup-tip) {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto);
}
/* Aviso sobre o mapa: branco translúcido no claro, superfície escura translúcida aqui */
:root[data-tema="escuro"] .mapa-overlay-aviso {
  background: rgb(21 28 36 / 95%);
}
</style>

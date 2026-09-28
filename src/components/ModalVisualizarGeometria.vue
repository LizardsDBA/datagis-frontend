<script setup>
/**
 * Modal isolado pra visualizar uma geometria WKT (Point/MultiPoint/Polygon/MultiPolygon
 * — os únicos tipos que o backend produz, ver GeoJsonWktMapper) num mapa Leaflet
 * pequeno. Não reaproveita nada de ConjuntosView.vue de propósito — é conteúdo próprio,
 * inclusive o parser WKT→GeoJSON, já que aquele componente trabalha com GeoJSON vindo
 * pronto do back, não com WKT texto.
 */
import { ref, watch, nextTick, onUnmounted, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  wkt: { type: String, default: null },
  titulo: { type: String, default: 'Geometria' },
})
const emit = defineEmits(['fechar'])

const mapaEl = ref(null)
const mapa = shallowRef(null)
const erroParse = ref(null)
const copiado = ref(false)

async function copiarWkt() {
  try {
    await navigator.clipboard.writeText(props.wkt)
    copiado.value = true
    setTimeout(() => {
      copiado.value = false
    }, 1500)
  } catch (e) {
    erroParse.value = 'Não foi possível copiar: ' + e.message
  }
}

function extrairGrupos(str) {
  const grupos = []
  let profundidade = 0
  let atual = ''
  for (const ch of str) {
    if (ch === '(') {
      profundidade++
      if (profundidade === 1) {
        atual = ''
        continue
      }
    }
    if (ch === ')') {
      profundidade--
      if (profundidade === 0) {
        grupos.push(atual)
        continue
      }
    }
    if (profundidade >= 1) atual += ch
  }
  return grupos
}

function paresParaCoordenadas(str) {
  return str
    .trim()
    .split(',')
    .map((par) => par.trim().split(/\s+/).map(Number))
}

function wktParaGeoJson(wkt) {
  if (!wkt) return null
  const texto = wkt.trim()
  const casamento = texto.match(/^([A-Za-z]+)\s*\((.*)\)$/s)
  if (!casamento) return null
  const tipo = casamento[1].toUpperCase()
  const corpo = casamento[2]

  switch (tipo) {
    case 'POINT': {
      const [x, y] = corpo.trim().split(/\s+/).map(Number)
      return { type: 'Point', coordinates: [x, y] }
    }
    case 'MULTIPOINT': {
      const semParenteses = corpo.replace(/[()]/g, '')
      return { type: 'MultiPoint', coordinates: paresParaCoordenadas(semParenteses) }
    }
    case 'POLYGON': {
      return { type: 'Polygon', coordinates: extrairGrupos(corpo).map(paresParaCoordenadas) }
    }
    case 'MULTIPOLYGON': {
      const poligonos = extrairGrupos(corpo).map((poligono) =>
        extrairGrupos(poligono).map(paresParaCoordenadas)
      )
      return { type: 'MultiPolygon', coordinates: poligonos }
    }
    default:
      return null
  }
}

async function desenhar() {
  erroParse.value = null
  const geoJson = wktParaGeoJson(props.wkt)
  if (!geoJson) {
    erroParse.value = 'Não foi possível interpretar essa geometria.'
    return
  }

  await nextTick()
  if (!mapaEl.value) return

  if (mapa.value) {
    mapa.value.remove()
    mapa.value = null
  }

  mapa.value = L.map(mapaEl.value, { zoomControl: true })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapa.value)

  const camada = L.geoJSON(geoJson, {
    style: { color: '#15803d', weight: 2, fillColor: '#22c55e', fillOpacity: 0.25 },
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 6, color: '#15803d', fillOpacity: 0.6 }),
  }).addTo(mapa.value)

  const limites = camada.getBounds()
  if (limites.isValid()) {
    mapa.value.fitBounds(limites, { padding: [24, 24] })
  } else {
    mapa.value.setView([-14.235, -51.925], 4)
  }
}

watch(() => props.wkt, desenhar, { immediate: true })

onUnmounted(() => {
  if (mapa.value) mapa.value.remove()
})
</script>

<template>
  <div class="fundo-modal" @click.self="emit('fechar')">
    <div class="caixa-modal">
      <div class="cabecalho-modal">
        <h3>{{ titulo }}</h3>
        <div class="acoes-cabecalho">
          <button class="botao-copiar-wkt" title="Copiar WKT" @click="copiarWkt">
            {{ copiado ? '✓ Copiado' : 'Copiar WKT' }}
          </button>
          <button class="botao-fechar" @click="emit('fechar')" aria-label="Fechar">✕</button>
        </div>
      </div>
      <div v-if="erroParse" class="aviso-erro">{{ erroParse }}</div>
      <div ref="mapaEl" class="area-mapa"></div>
    </div>
  </div>
</template>

<style scoped>
.fundo-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.caixa-modal {
  background: #ffffff;
  border-radius: 12px;
  width: min(700px, 100%);
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.cabecalho-modal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid #e2e8f0;
}

.cabecalho-modal h3 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}

.botao-fechar {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #64748b;
}

.acoes-cabecalho {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.botao-copiar-wkt {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  cursor: pointer;
  color: #334155;
}

.botao-copiar-wkt:hover {
  background: #f1f5f9;
}

.area-mapa {
  height: 420px;
  width: 100%;
}

.aviso-erro {
  padding: 0.75rem 1.1rem;
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.85rem;
}
</style>

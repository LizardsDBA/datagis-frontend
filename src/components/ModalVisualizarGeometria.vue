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

<style scoped src="../styles/modals/ModalVisualizarGeometria.css"></style>

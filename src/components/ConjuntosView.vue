<script setup>
/**
 * Conjuntos e Cobertura — mapa de cobertura dos indicadores (LIZARDS-35).
 *
 * - Visão por município ou por imóvel, com seleção de um item específico.
 * - KPIs (quantidades, imóveis com interseção e os 7 indicadores) vêm do backend, os
 *   mesmos da tela de tabela (LIZARDS-34): geral sem seleção, do item com seleção.
 * - Aviso de interseção vem dos VALORES dos indicadores, calculados no Oracle sobre a
 *   geometria completa da Silver. O GeoServer só desenha o mapa e destaca quais feições
 *   cruzam a seleção — a geometria do mapa é simplificada (~5 m) e erraria nas
 *   sobreposições pequenas, e qualquer sobreposição conta.
 * - O mapa mostra só o Paraná (recorte do desafio): contorno publicado na Gold, máscara
 *   sobre o resto, sem arrastar nem afastar pra fora do estado.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { listarTiposIndicador } from '../services/goldService'
import {
  listarIndicadoresPorImovel,
  listarIndicadoresPorMunicipio,
} from '../services/consultaIndicadoresService'
import {
  CAMADA_IMOVEL,
  CAMADA_MUNICIPIO,
  URL_WMS,
  buscarContornoParana,
  buscarFeicoesQueCruzam,
  buscarGeometriaDaSelecao,
  contarFeicoes,
  identificarNoPonto,
} from '../services/geoserverService'
import { camadaWmsAutenticada } from './camadaWmsAutenticada'

/**
 * Camada de cada indicador e como ler o aviso:
 * - RESTRICAO: sobrepor é o problema (área protegida, embargo, desmatamento, fogo)
 * - CONFORMIDADE: NÃO ter é o problema (imóvel sem Reserva Legal declarada)
 * - INFORMATIVO: só diz se o imóvel possui ou não aquela área
 * `camada` nulo = ainda não publicada no mapa (IRL/IAPP/ICV dependem de outra entrega);
 * o aviso funciona mesmo assim, porque vem do indicador.
 */
const CAMADAS_INDICADOR = [
  { indicador: 'ISAP', campo: 'valorIsap', camada: 'datagis:vw_mapa_area_protegida', rotulo: 'Área protegida (UC / TI)', cor: '#16a34a', leitura: 'RESTRICAO' },
  { indicador: 'IAE', campo: 'valorIae', camada: 'datagis:vw_mapa_embargo', rotulo: 'Embargo ambiental', cor: '#dc2626', leitura: 'RESTRICAO' },
  { indicador: 'IDESMAT', campo: 'valorIdesmat', camada: 'datagis:vw_mapa_desmatamento', rotulo: 'Desmatamento (PRODES)', cor: '#b45309', leitura: 'RESTRICAO' },
  { indicador: 'IFC', campo: 'valorIfc', camada: 'datagis:vw_mapa_foco_calor', rotulo: 'Foco de calor', cor: '#ea580c', leitura: 'RESTRICAO', ponto: true },
  { indicador: 'IRL', campo: 'valorIrl', camada: null, rotulo: 'Reserva Legal', cor: '#0d9488', leitura: 'CONFORMIDADE' },
  { indicador: 'IAPP', campo: 'valorIapp', camada: null, rotulo: 'APP declarada', cor: '#0891b2', leitura: 'INFORMATIVO' },
  { indicador: 'ICV', campo: 'valorIcv', camada: null, rotulo: 'Vegetação nativa', cor: '#65a30d', leitura: 'INFORMATIVO' },
]
const CAMADAS_NO_MAPA = CAMADAS_INDICADOR.filter((c) => c.camada)
const RESTRICOES = CAMADAS_INDICADOR.filter((c) => c.leitura === 'RESTRICAO')

/** Usado só se o contorno da Gold não carregar: caixa do Paraná. */
const CAIXA_PARANA = [[-27.2, -55], [-22, -47.5]]

// ------------------------------------------------------------------- estado

const visao = ref('municipio')
const tipos = ref([])
const municipios = ref([])
const imoveis = ref([])
const carregando = ref(false)
const erro = ref('')
const aviso = ref('')

const municipioSelecionado = ref('')
const filtroMunicipioImovel = ref('')
const buscaImovel = ref('')
const imovelSelecionado = ref('')

/** Feições publicadas por camada do mapa: { [camada]: { estado, total } } */
const situacaoCamadas = ref({})
/** Feições que cruzam a seleção, por camada (só destaque). */
const destacadas = ref({})
const camadasVisiveis = ref({ base: true, imoveis: true })

const mapaEl = ref(null)
const mapa = shallowRef(null)
let limitesParana = L.latLngBounds(CAIXA_PARANA)
let camadaMunicipios = null
let camadaImoveis = null
const camadasWms = {}
let destaque = null
let destaqueCruzamentos = null
let ultimaConsulta = 0

// ------------------------------------------------------------------ seleção

const selecao = computed(() => {
  if (visao.value === 'municipio' && municipioSelecionado.value) {
    return { tipo: 'municipio', codigo: String(municipioSelecionado.value) }
  }
  if (visao.value === 'imovel' && imovelSelecionado.value) {
    return { tipo: 'imovel', codigo: imovelSelecionado.value }
  }
  return null
})

const imovelDaSelecao = computed(() =>
  selecao.value?.tipo === 'imovel'
    ? imoveis.value.find((i) => i.codImovel === selecao.value.codigo) || null
    : null,
)

const municipioDaSelecao = computed(() => {
  if (!selecao.value) return null
  if (selecao.value.tipo === 'municipio') {
    return municipios.value.find((m) => String(m.codIbge) === selecao.value.codigo) || null
  }
  const cod = imovelDaSelecao.value?.municipioCodIbge
  return cod == null ? null : municipios.value.find((m) => m.codIbge === cod) || null
})

/** Imóveis que entram no aviso: todos, os do município, ou o selecionado. */
const imoveisDoRecorte = computed(() => {
  if (selecao.value?.tipo === 'imovel') return imovelDaSelecao.value ? [imovelDaSelecao.value] : []
  if (selecao.value?.tipo === 'municipio') {
    return imoveis.value.filter((i) => String(i.municipioCodIbge) === selecao.value.codigo)
  }
  return imoveis.value
})

const imoveisDoFiltro = computed(() => {
  const cod = filtroMunicipioImovel.value
  return cod ? imoveis.value.filter((i) => String(i.municipioCodIbge) === String(cod)) : imoveis.value
})

const sugestoesImovel = computed(() => {
  const termo = buscaImovel.value.trim().toUpperCase()
  const lista = termo
    ? imoveisDoFiltro.value.filter((i) => i.codImovel.toUpperCase().includes(termo))
    : imoveisDoFiltro.value
  return lista.slice(0, 200)
})

function trocarVisao(nova) {
  visao.value = nova
}

function aoEscolherImovel() {
  const valor = buscaImovel.value.trim()
  const achado = imoveis.value.find((i) => i.codImovel === valor)
  if (achado) imovelSelecionado.value = achado.codImovel
}

function limparSelecao() {
  municipioSelecionado.value = ''
  imovelSelecionado.value = ''
  buscaImovel.value = ''
  aviso.value = ''
}

// --------------------------------------------------------------------- KPIs

function campoDoIndicador(codigo) {
  return `valor${codigo.charAt(0).toUpperCase()}${codigo.slice(1).toLowerCase()}`
}

const indicadoresOrdenados = computed(() =>
  tipos.value
    .filter((t) => t.ativo !== false)
    .slice()
    .sort((a, b) => (a.ordemExibicao ?? 99) - (b.ordemExibicao ?? 99)),
)

/**
 * KPI geral: média ponderada pela área dos imóveis que têm o indicador calculado —
 * a mesma conta que o backend faz por município. Imóvel sem valor fica fora do
 * numerador e do denominador, pra ausência de cálculo não virar zero.
 */
function mediaPonderada(lista, campo) {
  let soma = 0
  let area = 0
  lista.forEach((i) => {
    const valor = i[campo]
    if (valor === null || valor === undefined || !i.areaHa) return
    soma += valor * i.areaHa
    area += i.areaHa
  })
  return area > 0 ? soma / area : null
}

const linhaDosKpis = computed(() => {
  if (selecao.value?.tipo === 'imovel') return imovelDaSelecao.value
  if (selecao.value?.tipo === 'municipio') return municipioDaSelecao.value
  const geral = {}
  indicadoresOrdenados.value.forEach((t) => {
    const campo = campoDoIndicador(t.codigo)
    geral[campo] = mediaPonderada(imoveis.value, campo)
  })
  return geral
})

function rotuloImoveisComSobreposicao(n) {
  return n === 1 ? 'imóvel com sobreposição' : 'imóveis com sobreposição'
}

function cruza(imovel, camada) {
  return (imovel?.[camada.campo] ?? 0) > 0
}

/**
 * Imóvel: quantas camadas de alerta ele cruza. Município / geral: quantos imóveis
 * cruzam alguma (vem pronto do backend, qtdImoveisComIntersecao).
 */
const kpisQuantidade = computed(() => {
  if (selecao.value?.tipo === 'imovel') {
    const n = RESTRICOES.filter((c) => cruza(imovelDaSelecao.value, c)).length
    return {
      imoveis: 1,
      municipios: 1,
      intersecoes: n,
      rotuloIntersecoes: n === 1 ? 'camada de alerta cruzada' : 'camadas de alerta cruzadas',
    }
  }
  if (selecao.value?.tipo === 'municipio') {
    const m = municipioDaSelecao.value
    return {
      imoveis: m?.qtdImoveis ?? 0,
      municipios: 1,
      intersecoes: m?.qtdImoveisComIntersecao ?? 0,
      rotuloIntersecoes: rotuloImoveisComSobreposicao(m?.qtdImoveisComIntersecao ?? 0),
    }
  }
  const total = municipios.value.reduce((soma, m) => soma + (m.qtdImoveisComIntersecao || 0), 0)
  return {
    imoveis: municipios.value.reduce((soma, m) => soma + (m.qtdImoveis || 0), 0),
    municipios: municipios.value.length,
    intersecoes: total,
    rotuloIntersecoes: rotuloImoveisComSobreposicao(total),
  }
})

/** Data da publicação mais recente dos indicadores no recorte. */
const dataPublicacao = computed(() => {
  const datas = imoveisDoRecorte.value.map((i) => i.dataPublicacao).filter(Boolean).sort()
  return datas.length ? datas[datas.length - 1] : null
})

function faixaDoValor(tipo, valor) {
  if (valor === null || valor === undefined) return 'neutro'
  if (tipo.limiteBom == null || tipo.limiteAtencao == null) return 'neutro'
  if (tipo.sentido === 'MENOR_MELHOR') {
    if (valor <= tipo.limiteBom) return 'sucesso'
    return valor <= tipo.limiteAtencao ? 'alerta' : 'erro'
  }
  if (valor >= tipo.limiteBom) return 'sucesso'
  return valor >= tipo.limiteAtencao ? 'alerta' : 'erro'
}

function formatarNumero(valor, casas = 1) {
  if (valor === null || valor === undefined) return '—'
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

function formatarInteiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR')
}

function formatarData(valor) {
  return valor ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

function codigoCurto(codigo) {
  return codigo && codigo.length > 22 ? `${codigo.slice(0, 19)}…` : codigo
}

const tituloSelecao = computed(() => {
  const sel = selecao.value
  if (!sel) return 'todo o recorte publicado'
  if (sel.tipo === 'municipio') return municipioDaSelecao.value?.nome || sel.codigo
  return codigoCurto(sel.codigo)
})

// -------------------------------------------------------------- aviso

function plural(n, singular, varios) {
  return `${formatarInteiro(n)} ${n === 1 ? singular : varios}`
}

/** Tom e texto do aviso de uma camada, a partir dos valores do indicador. */
function avisoDaCamada(c) {
  const lista = imoveisDoRecorte.value
  const comValor = lista.filter((i) => i[c.campo] !== null && i[c.campo] !== undefined)
  if (comValor.length === 0) return { tom: 'neutro', texto: 'Indicador não calculado' }

  if (selecao.value?.tipo === 'imovel') {
    const valor = comValor[0][c.campo]
    if (c.leitura === 'RESTRICAO') {
      return valor > 0 ? { tom: 'erro', texto: 'Intersecta' } : { tom: 'sucesso', texto: 'Sem interseção' }
    }
    if (c.leitura === 'CONFORMIDADE') {
      return valor > 0
        ? { tom: 'sucesso', texto: 'Reserva Legal declarada' }
        : { tom: 'alerta', texto: 'Sem Reserva Legal declarada' }
    }
    return valor > 0 ? { tom: 'info', texto: 'Possui' } : { tom: 'neutro', texto: 'Não possui' }
  }

  if (c.leitura === 'RESTRICAO') {
    const n = comValor.filter((i) => i[c.campo] > 0).length
    return n > 0
      ? { tom: 'erro', texto: `${plural(n, 'imóvel intersecta', 'imóveis intersectam')}` }
      : { tom: 'sucesso', texto: 'Nenhum imóvel intersecta' }
  }
  if (c.leitura === 'CONFORMIDADE') {
    const n = comValor.filter((i) => i[c.campo] === 0).length
    return n > 0
      ? { tom: 'alerta', texto: `${plural(n, 'imóvel', 'imóveis')} sem Reserva Legal declarada` }
      : { tom: 'sucesso', texto: 'Todos com Reserva Legal declarada' }
  }
  const n = comValor.filter((i) => i[c.campo] > 0).length
  return { tom: n > 0 ? 'info' : 'neutro', texto: `${plural(n, 'imóvel possui', 'imóveis possuem')}` }
}

const resumoAviso = computed(() => {
  if (!selecao.value) return null
  if (imoveisDoRecorte.value.length === 0) {
    return { tom: 'neutro', texto: 'Nenhum imóvel com indicadores publicados nesta seleção.' }
  }
  const alertas = CAMADAS_INDICADOR.filter((c) => ['erro', 'alerta'].includes(avisoDaCamada(c).tom))
  if (alertas.length === 0) return { tom: 'sucesso', texto: 'Sem interseção com camadas de alerta.' }
  return {
    tom: 'erro',
    texto: `Atenção: ${alertas.length} ${alertas.length === 1 ? 'camada' : 'camadas'} com alerta — ${alertas
      .map((c) => c.indicador)
      .join(', ')}.`,
  }
})

/** Situação da camada no mapa (independe do aviso). */
function textoDoMapa(c) {
  if (!c.camada) return 'Camada ainda não publicada no mapa'
  const situacao = situacaoCamadas.value[c.camada]
  if (!situacao || situacao.estado === 'carregando') return 'Verificando camada…'
  if (situacao.estado === 'erro') return 'Não foi possível consultar a camada'
  if (situacao.total === 0) return 'Sem feições publicadas na Gold'
  const n = destacadas.value[c.camada]
  if (selecao.value && n === 0) return 'Nenhuma feição cruzando no mapa'
  if (selecao.value && n != null) return `${plural(n, 'feição destacada', 'feições destacadas')} no mapa`
  return `${plural(situacao.total, 'feição publicada', 'feições publicadas')}`
}

async function verificarCamadas() {
  const estados = {}
  CAMADAS_NO_MAPA.forEach((c) => (estados[c.camada] = { estado: 'carregando' }))
  situacaoCamadas.value = { ...estados }
  await Promise.all(
    CAMADAS_NO_MAPA.map(async (c) => {
      try {
        const total = await contarFeicoes(c.camada)
        situacaoCamadas.value = { ...situacaoCamadas.value, [c.camada]: { estado: 'ok', total } }
      } catch {
        situacaoCamadas.value = { ...situacaoCamadas.value, [c.camada]: { estado: 'erro', total: 0 } }
      }
    }),
  )
}

// --------------------------------------------------------------------- mapa

function wms(camada, extras = {}) {
  return camadaWmsAutenticada(URL_WMS, {
    layers: camada,
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    ...extras,
  })
}

/** Cor do fundo da página, pra máscara acompanhar o tema. */
function corDaMascara() {
  const cor = getComputedStyle(document.documentElement).getPropertyValue('--cor-slate-100').trim()
  return cor || '#f1f5f9'
}

/** Anéis externos do contorno em [lat, lng] — viram os "furos" da máscara. */
function aneisExternos(geojson) {
  const aneis = []
  geojson.features.forEach((f) => {
    const g = f.geometry
    const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    poligonos.forEach((p) => aneis.push(p[0].map(([lng, lat]) => [lat, lng])))
  })
  return aneis
}

function iniciarMapa() {
  mapa.value = L.map(mapaEl.value, { zoomControl: true, attributionControl: true })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa.value)

  camadaMunicipios = wms(CAMADA_MUNICIPIO, { zIndex: 5 }).addTo(mapa.value)
  camadaImoveis = wms(CAMADA_IMOVEL, { zIndex: 10 }).addTo(mapa.value)
  CAMADAS_NO_MAPA.forEach((c, i) => {
    camadasWms[c.camada] = wms(c.camada, { zIndex: 20 + i })
  })

  prenderNoParana()
  mapa.value.on('click', aoClicarNoMapa)
}

/** Enquadra o estado inteiro e não deixa sair dele (arrastar nem afastar). */
function prenderNoParana() {
  mapa.value.setMaxBounds(limitesParana.pad(0.05))
  mapa.value.options.maxBoundsViscosity = 1.0
  mapa.value.fitBounds(limitesParana)
  mapa.value.setMinZoom(mapa.value.getZoom())
}

/**
 * Máscara por cima dos tiles (OpenStreetMap e WMS) e abaixo dos destaques: um
 * retângulo do mundo com o Paraná recortado. É o que faz o mapa mostrar só o estado.
 */
async function desenharContornoParana() {
  try {
    const contorno = await buscarContornoParana()
    if (!contorno.features?.length) throw new Error('camada LIMITE_PR sem feição publicada')
    mapa.value.createPane('mascara')
    mapa.value.getPane('mascara').style.zIndex = 350
    const mundo = [[-90, -360], [-90, 360], [90, 360], [90, -360]]
    L.polygon([mundo, ...aneisExternos(contorno)], {
      pane: 'mascara',
      stroke: false,
      fillColor: corDaMascara(),
      fillOpacity: 1,
      interactive: false,
    }).addTo(mapa.value)
    const linha = L.geoJSON(contorno, {
      pane: 'mascara',
      style: { color: '#0f172a', weight: 2, fill: false },
      interactive: false,
    }).addTo(mapa.value)
    limitesParana = linha.getBounds()
    prenderNoParana()
  } catch (e) {
    erro.value = `Contorno do Paraná indisponível (${e.message}). Publique a camada LIMITE_PR na Gold.`
  }
}

/** Liga no mapa as camadas que têm dado e estão marcadas na legenda. */
function sincronizarCamadas() {
  if (!mapa.value) return
  const alternar = (layer, ligada) => {
    if (!layer) return
    if (ligada && !mapa.value.hasLayer(layer)) layer.addTo(mapa.value)
    if (!ligada && mapa.value.hasLayer(layer)) mapa.value.removeLayer(layer)
  }
  CAMADAS_NO_MAPA.forEach((c) => {
    alternar(camadasWms[c.camada], camadasVisiveis.value[c.camada] && situacaoCamadas.value[c.camada]?.total > 0)
  })
  alternar(camadaMunicipios, camadasVisiveis.value.base)
  alternar(camadaImoveis, camadasVisiveis.value.imoveis)
}

/** Com município em foco, o WMS de imóveis desenha só os imóveis dele. */
function filtrarImoveisNoMapa() {
  const cod = municipioDaSelecao.value?.codIbge
  camadaImoveis?.setParams({ CQL_FILTER: cod ? `MUNICIPIO_COD_IBGE=${Number(cod)}` : 'INCLUDE' })
}

function limparDestaques() {
  if (destaque) mapa.value?.removeLayer(destaque)
  if (destaqueCruzamentos) mapa.value?.removeLayer(destaqueCruzamentos)
  destaque = null
  destaqueCruzamentos = null
}

async function destacarSelecao(sel, consulta) {
  limparDestaques()
  if (!sel) {
    mapa.value?.fitBounds(limitesParana)
    return
  }
  try {
    const geo = await buscarGeometriaDaSelecao(sel)
    if (consulta !== ultimaConsulta || !geo.features.length) return
    destaque = L.geoJSON(geo, {
      style: { color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: sel.tipo === 'imovel' ? 0.25 : 0.05 },
      interactive: false,
    }).addTo(mapa.value)
    mapa.value.fitBounds(destaque.getBounds(), { padding: [30, 30], maxZoom: 15 })
  } catch (e) {
    erro.value = `Não foi possível localizar a seleção no mapa: ${e.message}`
  }
}

/** Busca no GeoServer as feições que cruzam a seleção e pinta por cima — só visual. */
async function destacarCruzamentos(sel, consulta) {
  const comDado = CAMADAS_NO_MAPA.filter((c) => situacaoCamadas.value[c.camada]?.total > 0)
  const resultados = await Promise.all(
    comDado.map(async (c) => {
      try {
        return { c, geo: await buscarFeicoesQueCruzam(c.camada, sel) }
      } catch {
        return { c, geo: null }
      }
    }),
  )
  if (consulta !== ultimaConsulta || !mapa.value) return
  const contagem = {}
  resultados.forEach(({ c, geo }) => {
    if (geo) contagem[c.camada] = geo.features.length
  })
  destacadas.value = contagem
  const comFeicao = resultados.filter(({ geo }) => geo?.features.length)
  if (!comFeicao.length) return
  destaqueCruzamentos = L.layerGroup(
    comFeicao.map(({ c, geo }) =>
      L.geoJSON(geo, {
        style: { color: c.cor, weight: 2.5, fillOpacity: 0.15 },
        pointToLayer: (_, latlng) =>
          L.circleMarker(latlng, { radius: 6, color: '#ffffff', weight: 1.5, fillColor: c.cor, fillOpacity: 1 }),
        onEachFeature: (f, layer) => layer.bindTooltip(`${c.rotulo}: ${f.properties.ROTULO || f.properties.COD_NATURAL}`),
      }),
    ),
  ).addTo(mapa.value)
}

/** Clique no mapa seleciona o município ou o imóvel sob o cursor. */
async function aoClicarNoMapa(evento) {
  if (!limitesParana.contains(evento.latlng)) return
  const { lat, lng } = evento.latlng
  aviso.value = ''
  try {
    if (visao.value === 'imovel') {
      const codigo = await identificarNoPonto(CAMADA_IMOVEL, lng, lat)
      if (!codigo) return
      imovelSelecionado.value = codigo
      buscaImovel.value = codigo
      return
    }
    const codigo = await identificarNoPonto(CAMADA_MUNICIPIO, lng, lat)
    if (!codigo) return
    if (municipios.value.some((m) => String(m.codIbge) === String(codigo))) {
      municipioSelecionado.value = String(codigo)
    } else {
      aviso.value = 'Este município ainda não tem imóveis com indicadores publicados.'
    }
  } catch (e) {
    erro.value = `Falha ao identificar o ponto clicado: ${e.message}`
  }
}

// ------------------------------------------------------------- ciclo de vida

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const [listaTipos, listaMunicipios, listaImoveis] = await Promise.all([
      listarTiposIndicador(),
      listarIndicadoresPorMunicipio(),
      listarIndicadoresPorImovel(),
    ])
    tipos.value = listaTipos
    municipios.value = listaMunicipios
    imoveis.value = listaImoveis
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

watch(selecao, async (sel) => {
  const consulta = ++ultimaConsulta
  erro.value = ''
  destacadas.value = {}
  filtrarImoveisNoMapa()
  await destacarSelecao(sel, consulta)
  if (sel) await destacarCruzamentos(sel, consulta)
})

watch([situacaoCamadas, camadasVisiveis], sincronizarCamadas, { deep: true })

onMounted(async () => {
  CAMADAS_NO_MAPA.forEach((c) => (camadasVisiveis.value[c.camada] = true))
  await nextTick()
  iniciarMapa()
  await Promise.all([carregar(), verificarCamadas(), desenharContornoParana()])
})

onUnmounted(() => {
  mapa.value?.remove()
  mapa.value = null
})
</script>

<template>
  <div class="pagina-mapa">
    <header class="topo-pagina">
      <div>
        <h1 class="titulo">Conjuntos e Cobertura</h1>
        <p class="subtitulo">Indicadores e interseções por município ou imóvel rural do Paraná.</p>
      </div>
      <button class="btn-secundario" :disabled="carregando || !selecao" @click="limparSelecao">Limpar seleção</button>
    </header>

    <div v-if="erro" class="alerta-erro" role="alert">{{ erro }}</div>

    <section class="barra-selecao">
      <div class="chaveamento" role="tablist" aria-label="Tipo de visão">
        <button
          type="button"
          role="tab"
          :aria-selected="visao === 'municipio'"
          :class="['chave', { 'chave--ativa': visao === 'municipio' }]"
          @click="trocarVisao('municipio')"
        >
          Municípios
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="visao === 'imovel'"
          :class="['chave', { 'chave--ativa': visao === 'imovel' }]"
          @click="trocarVisao('imovel')"
        >
          Imóveis
        </button>
      </div>

      <template v-if="visao === 'municipio'">
        <label class="campo">
          <span class="campo-rotulo">Município</span>
          <select id="select-municipio" v-model="municipioSelecionado" :disabled="carregando">
            <option value="">Todos os municípios</option>
            <option v-for="m in municipios" :key="m.codIbge" :value="String(m.codIbge)">
              {{ m.nome || m.codIbge }} ({{ formatarInteiro(m.qtdImoveis) }} imóveis)
            </option>
          </select>
        </label>
      </template>

      <template v-else>
        <label class="campo">
          <span class="campo-rotulo">Filtrar por município</span>
          <select id="select-filtro-municipio" v-model="filtroMunicipioImovel" :disabled="carregando">
            <option value="">Todos</option>
            <option v-for="m in municipios" :key="m.codIbge" :value="String(m.codIbge)">{{ m.nome || m.codIbge }}</option>
          </select>
        </label>
        <label class="campo campo--largo">
          <span class="campo-rotulo">Imóvel (código CAR)</span>
          <input
            id="input-imovel"
            v-model="buscaImovel"
            list="lista-imoveis"
            type="search"
            placeholder="Digite parte do código ou clique no mapa"
            :disabled="carregando"
            @change="aoEscolherImovel"
          />
          <datalist id="lista-imoveis">
            <option v-for="i in sugestoesImovel" :key="i.codImovel" :value="i.codImovel">{{ i.municipioNome }}</option>
          </datalist>
        </label>
      </template>
    </section>

    <section class="kpis" aria-label="Indicadores da seleção">
      <p class="kpis-titulo">
        KPIs de <strong>{{ tituloSelecao }}</strong>
        <span v-if="!selecao" class="kpis-nota">· média ponderada pela área</span>
        <span v-if="dataPublicacao" class="kpis-nota">· indicadores publicados em {{ formatarData(dataPublicacao) }}</span>
      </p>
      <div class="kpis-quantidades">
        <div class="kpi" data-kpi="imoveis">
          <span class="kpi-rotulo">Imóveis</span>
          <span class="kpi-valor">{{ formatarInteiro(kpisQuantidade.imoveis) }}</span>
        </div>
        <div class="kpi" data-kpi="municipios">
          <span class="kpi-rotulo">Municípios</span>
          <span class="kpi-valor">{{ formatarInteiro(kpisQuantidade.municipios) }}</span>
        </div>
        <div class="kpi" data-kpi="intersecoes">
          <span class="kpi-rotulo">Interseções</span>
          <span class="kpi-valor">{{ formatarInteiro(kpisQuantidade.intersecoes) }}</span>
          <span class="kpi-dica">{{ kpisQuantidade.rotuloIntersecoes }}</span>
        </div>
      </div>
      <div class="kpis-indicadores">
        <div
          v-for="t in indicadoresOrdenados"
          :key="t.codigo"
          :data-indicador="t.codigo"
          :class="['kpi-indicador', `kpi-indicador--${faixaDoValor(t, linhaDosKpis?.[campoDoIndicador(t.codigo)])}`]"
          :title="t.descricao"
        >
          <span class="kpi-rotulo">{{ t.codigo }}</span>
          <span class="kpi-valor">
            {{ formatarNumero(linhaDosKpis?.[campoDoIndicador(t.codigo)]) }}
            <small v-if="linhaDosKpis?.[campoDoIndicador(t.codigo)] != null">{{ t.unidadeSimbolo || '%' }}</small>
          </span>
        </div>
      </div>
    </section>

    <section class="area-mapa">
      <div class="mapa-coluna">
        <div ref="mapaEl" class="mapa" role="application" aria-label="Mapa de cobertura do Paraná"></div>
        <p class="mapa-dica">
          Clique no mapa para selecionar {{ visao === 'imovel' ? 'um imóvel' : 'um município' }}.
          <span v-if="aviso" class="mapa-aviso">{{ aviso }}</span>
        </p>
      </div>

      <aside class="painel-aviso" aria-live="polite">
        <h2 class="painel-titulo">Aviso de interseção</h2>
        <p v-if="!selecao" class="painel-vazio">
          Selecione um município ou imóvel para ver o aviso dele. Abaixo, a situação de todo o recorte.
        </p>
        <div v-else-if="resumoAviso" :class="['resumo-aviso', `resumo-aviso--${resumoAviso.tom}`]">
          {{ resumoAviso.texto }}
        </div>

        <ul class="lista-camadas">
          <li class="item-camada">
            <label class="camada-toggle">
              <input v-model="camadasVisiveis.base" type="checkbox" />
              <span class="amostra amostra--contorno" style="--cor: #64748b"></span>
              Limites municipais
            </label>
          </li>
          <li class="item-camada">
            <label class="camada-toggle">
              <input v-model="camadasVisiveis.imoveis" type="checkbox" />
              <span class="amostra" style="--cor: #2563eb"></span>
              Imóveis rurais (CAR)
            </label>
          </li>
          <li v-for="c in CAMADAS_INDICADOR" :key="c.indicador" class="item-camada" :data-camada="c.indicador">
            <label class="camada-toggle">
              <input
                v-if="c.camada"
                v-model="camadasVisiveis[c.camada]"
                type="checkbox"
                :disabled="!(situacaoCamadas[c.camada]?.total > 0)"
              />
              <span v-else class="sem-checkbox"></span>
              <span :class="['amostra', { 'amostra--ponto': c.ponto }]" :style="{ '--cor': c.cor }"></span>
              <span class="camada-nome">{{ c.rotulo }} <em>({{ c.indicador }})</em></span>
            </label>
            <span :class="['badge-tag', `badge-tag--${avisoDaCamada(c).tom}`]">{{ avisoDaCamada(c).texto }}</span>
            <span class="camada-mapa">{{ textoDoMapa(c) }}</span>
          </li>
        </ul>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.pagina-mapa {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.titulo {
  font-size: 1.65rem;
  letter-spacing: -0.02em;
}

.subtitulo {
  margin-top: 0.15rem;
  color: var(--cor-slate-500);
  font-size: 0.9rem;
}

.btn-secundario {
  padding: 0.5rem 0.9rem;
  font-size: 0.83rem;
  font-weight: 700;
  border-radius: var(--raio-md);
  cursor: pointer;
  background: var(--cor-branco);
  color: var(--cor-slate-700);
  border: 1px solid var(--cor-slate-300);
  font-family: inherit;
}

.btn-secundario:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alerta-erro {
  padding: 0.75rem 1rem;
  border-radius: var(--raio-md);
  background: var(--status-erro-bg);
  color: var(--status-erro-texto);
  border: 1px solid var(--status-erro-borda);
  font-size: 0.88rem;
}

/* ------------------------------------------------------------ seleção */

.barra-selecao {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}

.chaveamento {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: var(--raio-md);
  background: var(--cor-slate-100);
  border: 1px solid var(--cor-slate-200);
}

.chave {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: var(--raio-sm);
  background: transparent;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--cor-slate-500);
  cursor: pointer;
}

.chave--ativa {
  background: var(--cor-branco);
  color: var(--cor-primaria);
  box-shadow: var(--sombra-sm);
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 14rem;
}

.campo--largo {
  flex: 1 1 22rem;
}

.campo-rotulo {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cor-slate-500);
}

.campo select,
.campo input {
  height: 2.4rem;
  padding: 0 0.7rem;
  border: 1px solid var(--cor-slate-300);
  border-radius: var(--raio-md);
  background: var(--cor-branco);
  font-family: inherit;
  font-size: 0.9rem;
  color: var(--cor-slate-800);
}

.campo select:focus,
.campo input:focus {
  outline: 2px solid var(--cor-primaria-glow);
  border-color: var(--cor-primaria);
}

/* --------------------------------------------------------------- KPIs */

.kpis {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.15rem;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-lg);
  box-shadow: var(--sombra-sm);
}

.kpis-titulo {
  font-size: 0.88rem;
  color: var(--cor-slate-600);
}

.kpis-nota {
  color: var(--cor-slate-400);
}

.kpis-quantidades,
.kpis-indicadores {
  display: grid;
  gap: 0.75rem;
}

.kpis-quantidades {
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
}

.kpis-indicadores {
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
}

.kpi,
.kpi-indicador {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.kpi-indicador {
  padding: 0.55rem 0.7rem;
  border-radius: var(--raio-md);
  border: 1px solid var(--status-neutro-borda);
  background: var(--status-neutro-bg);
  text-align: center;
}

.kpi-indicador--sucesso {
  background: var(--status-sucesso-bg);
  border-color: var(--status-sucesso-borda);
}

.kpi-indicador--alerta {
  background: var(--status-alerta-bg);
  border-color: var(--status-alerta-borda);
}

.kpi-indicador--erro {
  background: var(--status-erro-bg);
  border-color: var(--status-erro-borda);
}

.kpi-rotulo {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cor-slate-500);
}

.kpi-valor {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--cor-slate-900);
  letter-spacing: -0.02em;
}

.kpi-valor small {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--cor-slate-500);
}

.kpi-dica {
  font-size: 0.75rem;
  color: var(--cor-slate-400);
}

/* --------------------------------------------------------------- mapa */

.area-mapa {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 21rem;
  gap: 1rem;
  align-items: start;
}

.mapa-coluna {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.mapa {
  height: 560px;
  border-radius: var(--raio-lg);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-sm);
  overflow: hidden;
  z-index: 0;
  background: var(--cor-slate-100);
}

.mapa-dica {
  font-size: 0.78rem;
  color: var(--cor-slate-500);
}

.mapa-aviso {
  margin-left: 0.4rem;
  color: var(--status-alerta-texto);
  font-weight: 600;
}

/* ------------------------------------------------------- painel aviso */

.painel-aviso {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-lg);
  box-shadow: var(--sombra-sm);
}

.painel-titulo {
  font-size: 1rem;
  font-weight: 700;
}

.painel-vazio {
  font-size: 0.85rem;
  color: var(--cor-slate-500);
}

.resumo-aviso {
  padding: 0.7rem 0.85rem;
  border-radius: var(--raio-md);
  font-size: 0.86rem;
  font-weight: 600;
  border: 1px solid var(--status-neutro-borda);
  background: var(--status-neutro-bg);
  color: var(--status-neutro-texto);
}

.resumo-aviso--sucesso {
  background: var(--status-sucesso-bg);
  border-color: var(--status-sucesso-borda);
  color: var(--status-sucesso-texto);
}

.resumo-aviso--erro {
  background: var(--status-erro-bg);
  border-color: var(--status-erro-borda);
  color: var(--status-erro-texto);
}

.lista-camadas {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.item-camada {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--cor-slate-100);
}

.item-camada:last-child {
  border-bottom: none;
}

.item-camada .badge-tag,
.camada-mapa {
  align-self: flex-start;
  margin-left: 1.9rem;
}

.camada-mapa {
  font-size: 0.74rem;
  color: var(--cor-slate-400);
}

.camada-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--cor-slate-700);
  cursor: pointer;
}

.sem-checkbox {
  width: 13px;
  flex-shrink: 0;
}

.camada-nome em {
  font-style: normal;
  color: var(--cor-slate-400);
  font-weight: 500;
}

.amostra {
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--cor) 35%, transparent);
  border: 1.5px solid var(--cor);
}

.amostra--contorno {
  background: transparent;
  border-style: dashed;
}

.amostra--ponto {
  border-radius: 50%;
  background: var(--cor);
}

@media (max-width: 1100px) {
  .area-mapa {
    grid-template-columns: 1fr;
  }

  .mapa {
    height: 420px;
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

/* Menu moderno (LIZARDS-38): o .input-campo usa appearance: none, que vence a regra
   global do style.css; aqui ele também passa a usar a lista desenhada pelo CSS. */
@supports (appearance: base-select) {
  select.input-campo,
  select.input-campo::picker(select) {
    appearance: base-select;
  }

  /* a tela já desenha a própria setinha (.select-chevron); esconde a do navegador */
  select.input-campo::picker-icon {
    display: none;
  }
}
</style>

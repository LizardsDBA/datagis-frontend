<script setup>
/**
 * Indicadores e Resultados — mapa (LIZARDS-35). Rota /conjuntos; a mesma área em tabela é
 * a /indicadores (LIZARDS-34), e as duas telas se alternam por "Ver em tabela" / "Ver no mapa".
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
import { estadoTema } from '../tema'
import { useRoute, useRouter } from 'vue-router'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

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

/** Quantos imóveis com alerta a lista do painel mostra antes do "Mostrar todos". */
const LIMITE_LISTA_ALERTA = 8

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
const camadasVisiveis = ref({ base: true, comDados: true, imoveis: true })

/**
 * Carregamento visível: camadas WMS com imagem chegando (eventos loading/load do
 * Leaflet) + consultas ao GeoServer em andamento (contorno, destaque da seleção,
 * feições que cruzam). Qualquer um pendente mostra o aviso sobre o mapa.
 */
const camadasCarregando = ref(new Set())
const buscasNoMapa = ref(0)
const mapaCarregando = computed(() => camadasCarregando.value.size > 0 || buscasNoMapa.value > 0)

async function comCarregamento(tarefa) {
  buscasNoMapa.value++
  try {
    return await tarefa()
  } finally {
    buscasNoMapa.value--
  }
}

const route = useRoute()
const router = useRouter()
const listaAlertaCompleta = ref(false)
/** Aba da lista de imóveis do município: 'sobreposicao' (ISAP/IAE/IDESMAT/IFC) ou 'reservaLegal' (IRL = 0). */
const tipoListaAlerta = ref('sobreposicao')
/** Item do painel destacado depois de clicar no código do aviso. */
const camadaEmFoco = ref('')
const painelAvisoEl = ref(null)
let temporizadorFoco = null
const podeVerTabela = temPermissao(PERMISSOES.INDICADOR_VISUALIZAR)

const mapaEl = ref(null)
const mapa = shallowRef(null)
let limitesParana = L.latLngBounds(CAIXA_PARANA)
let camadaMunicipios = null
let camadaImoveis = null
let camadaComDados = null
let camadaComDadosContorno = null

/**
 * Estilos extras do GeoServer (infra/geoserver/estilos) para os municípios com imóveis
 * publicados: o preenchimento vai abaixo dos imóveis e o contorno acima deles, senão onde
 * os imóveis cobrem o município quase inteiro (Maringá, Ponta Grossa) o destaque sumia.
 */
const ESTILO_MUNICIPIO_COM_DADOS = 'vw_mapa_municipio_com_dados'
const ESTILO_MUNICIPIO_COM_DADOS_CONTORNO = 'vw_mapa_municipio_com_dados_contorno'
const camadasWms = {}
let destaque = null
let destaqueCruzamentos = null
let mascara = null
let contornoParana = null
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

/** Da lista de imóveis com alerta do município: passa para a visão de imóvel nele. */
function selecionarImovelDaLista(imovel) {
  visao.value = 'imovel'
  filtroMunicipioImovel.value = String(imovel.municipioCodIbge ?? '')
  imovelSelecionado.value = imovel.codImovel
  buscaImovel.value = imovel.codImovel
}

// ---------------------------------------------------- seleção na URL

/**
 * A seleção vai para a URL (?municipio=4119905 ou ?imovel=PR-...): F5 volta no mesmo
 * item e dá para mandar o link. Só é aplicada depois que os indicadores chegam, para
 * conferir que o código existe — código desconhecido é ignorado.
 */
function aplicarSelecaoDaUrl() {
  const { municipio, imovel } = route?.query || {}
  if (imovel) {
    const achado = imoveis.value.find((i) => i.codImovel === imovel)
    if (achado) selecionarImovelDaLista(achado)
    return
  }
  if (municipio && municipios.value.some((m) => String(m.codIbge) === String(municipio))) {
    visao.value = 'municipio'
    municipioSelecionado.value = String(municipio)
  }
}

function gravarSelecaoNaUrl(sel) {
  if (!router) return
  const query = sel ? { [sel.tipo]: sel.codigo } : {}
  const atual = route?.query || {}
  if (atual.municipio === query.municipio && atual.imovel === query.imovel) return
  router.replace({ query })
}

/** Atalho para a tela de Indicadores e Resultados já aberta no item selecionado. */
function verNaTabela() {
  const sel = selecao.value
  const query = sel?.tipo === 'imovel' ? { visao: 'imovel', imovel: sel.codigo } : sel ? { municipio: sel.codigo } : {}
  router?.push({ path: '/indicadores', query })
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

/**
 * Soma de um valor absoluto em hectares (déficit/excedente de RL, passivo de APP) —
 * mesma semântica SUM() do backend por município: não é percentual, não entra na
 * média ponderada por área.
 */
function somaIndicador(lista, campo) {
  let soma = null
  lista.forEach((i) => {
    const valor = i[campo]
    if (valor === null || valor === undefined) return
    soma = (soma ?? 0) + valor
  })
  return soma
}

const linhaDosKpis = computed(() => {
  if (selecao.value?.tipo === 'imovel') return imovelDaSelecao.value
  if (selecao.value?.tipo === 'municipio') return municipioDaSelecao.value
  const geral = {}
  indicadoresOrdenados.value.forEach((t) => {
    const campo = campoDoIndicador(t.codigo)
    geral[campo] = mediaPonderada(imoveis.value, campo)
  })
  geral.valorIrlDeficitHa = somaIndicador(imoveis.value, 'valorIrlDeficitHa')
  geral.valorIappPassivoHa = somaIndicador(imoveis.value, 'valorIappPassivoHa')
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
  // Enquanto os indicadores não chegam, "não calculado" daria a impressão de falta de dado
  if (carregando.value) return { tom: 'neutro', texto: 'Carregando…' }
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
  // Os códigos viram botões no template (irParaCamada): o aviso leva até a explicação.
  return {
    tom: 'erro',
    texto: `Atenção: ${alertas.length} ${alertas.length === 1 ? 'camada' : 'camadas'} com alerta —`,
    alertas,
  }
})

/**
 * Clique num código do aviso. Com município selecionado e imóveis naquela situação, abre
 * a aba certa da lista; senão leva até o item da camada no painel, que fica destacado
 * (é onde está a explicação — IRL, IAPP e ICV nem têm camada no mapa).
 */
async function irParaCamada(c) {
  const tipoLista = c.leitura === 'CONFORMIDADE' ? 'reservaLegal' : c.leitura === 'RESTRICAO' ? 'sobreposicao' : null
  const lista = tipoLista === 'reservaLegal' ? imoveisSemReservaLegal.value : imoveisComAlerta.value
  if (tipoLista && lista.length) {
    tipoListaAlerta.value = tipoLista
    listaAlertaCompleta.value = false
    await nextTick()
    painelAvisoEl.value?.querySelector('.lista-alerta')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }
  camadaEmFoco.value = c.indicador
  clearTimeout(temporizadorFoco)
  temporizadorFoco = setTimeout(() => (camadaEmFoco.value = ''), 2500)
  if (!(tipoLista && lista.length)) {
    await nextTick()
    painelAvisoEl.value
      ?.querySelector(`[data-camada="${c.indicador}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }
}

/**
 * Imóveis do município selecionado que cruzam alguma camada de alerta (mesma regra do
 * KPI "Interseções": ISAP, IAE, IDESMAT ou IFC > 0). Primeiro os que cruzam mais
 * camadas; empate, o de maior sobreposição percentual.
 */
const imoveisComAlerta = computed(() => {
  if (selecao.value?.tipo !== 'municipio') return []
  const percentuais = RESTRICOES.filter((c) => !c.ponto)
  return imoveisDoRecorte.value
    .map((imovel) => ({
      imovel,
      alertas: RESTRICOES.filter((c) => cruza(imovel, c)),
      pior: Math.max(0, ...percentuais.map((c) => imovel[c.campo] ?? 0)),
    }))
    .filter((x) => x.alertas.length)
    .sort((a, b) => b.alertas.length - a.alertas.length || b.pior - a.pior)
})

/** Imóveis do município com IRL = 0 (sem Reserva Legal declarada). Fora do KPI de interseções. */
const imoveisSemReservaLegal = computed(() => {
  if (selecao.value?.tipo !== 'municipio') return []
  const irl = CAMADAS_INDICADOR.find((c) => c.leitura === 'CONFORMIDADE')
  return imoveisDoRecorte.value
    .filter((imovel) => imovel[irl.campo] === 0)
    .sort((a, b) => (b.areaHa ?? 0) - (a.areaHa ?? 0))
    .map((imovel) => ({ imovel, alertas: [irl] }))
})

/** Aba escolhida; se ela estiver vazia e a outra não, mostra a outra. */
const tipoListaEfetivo = computed(() => {
  if (tipoListaAlerta.value === 'reservaLegal' && !imoveisSemReservaLegal.value.length) return 'sobreposicao'
  if (tipoListaAlerta.value === 'sobreposicao' && !imoveisComAlerta.value.length && imoveisSemReservaLegal.value.length) {
    return 'reservaLegal'
  }
  return tipoListaAlerta.value
})

const listaAlertaAtual = computed(() =>
  tipoListaEfetivo.value === 'reservaLegal' ? imoveisSemReservaLegal.value : imoveisComAlerta.value,
)

const imoveisComAlertaVisiveis = computed(() =>
  listaAlertaCompleta.value ? listaAlertaAtual.value : listaAlertaAtual.value.slice(0, LIMITE_LISTA_ALERTA),
)

function trocarListaAlerta(tipo) {
  tipoListaAlerta.value = tipo
  listaAlertaCompleta.value = false
}

function valorComUnidade(tipoOuSimbolo, valor) {
  const simbolo = typeof tipoOuSimbolo === 'string' ? tipoOuSimbolo : tipoOuSimbolo?.unidadeSimbolo || '%'
  const numero = formatarNumero(valor)
  return simbolo === '%' ? `${numero}%` : `${numero} ${simbolo}`
}

function tipoDoIndicador(codigo) {
  return tipos.value.find((t) => t.codigo === codigo)
}

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
  const layer = camadaWmsAutenticada(URL_WMS, {
    layers: camada,
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    ...extras,
  })
  // 'remove' também tira da lista: camada desligada no meio do carregamento não dispara 'load'
  const parou = () => camadasCarregando.value.delete(layer)
  return layer
    .on('loading', () => camadasCarregando.value.add(layer))
    .on('load', parou)
    .on('remove', parou)
}

/**
 * Cores do tema atual lidas das variáveis do style.css: a máscara usa o mesmo fundo do
 * container do mapa e o contorno a cor de título. No escuro (LIZARDS-38) as duas
 * variáveis já apontam pra paleta escura; o Leaflet pinta com cor fixa, então é preciso
 * reler e aplicar de novo a cada troca de tema (ver o watch de estadoTema).
 */
function corDoTema(variavel, padrao) {
  const cor = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim()
  return cor || padrao
}

function corDaMascara() {
  return corDoTema('--cor-slate-100', '#f1f5f9')
}

function corDoContorno() {
  return corDoTema('--cor-slate-900', '#0f172a')
}

function aplicarCoresDoTema() {
  mascara?.setStyle({ fillColor: corDaMascara() })
  contornoParana?.setStyle({ color: corDoContorno() })
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
  // Zoom fracionado: o enquadramento do Paraná não precisa cair num nível inteiro e
  // sobrar faixa vazia em volta do estado.
  mapa.value = L.map(mapaEl.value, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 })
  // OpenStreetMap num painel só dele, abaixo do painel de tiles: no tema escuro o filtro
  // que escurece o fundo (LIZARDS-38) vale só aqui. As camadas do GeoServer também são
  // tiles e, no painel padrão, teriam as cores invertidas (azul virando laranja).
  mapa.value.createPane('fundo')
  mapa.value.getPane('fundo').style.zIndex = 150
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    pane: 'fundo',
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa.value)

  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa.value)

  camadaMunicipios = wms(CAMADA_MUNICIPIO, { zIndex: 5 }).addTo(mapa.value)
  camadaImoveis = wms(CAMADA_IMOVEL, { zIndex: 10 }).addTo(mapa.value)
  CAMADAS_NO_MAPA.forEach((c, i) => {
    camadasWms[c.camada] = wms(c.camada, { zIndex: 20 + i })
  })

  prenderNoParana()
  mapa.value.on('click', aoClicarNoMapa)
  mapa.value.on('mousemove', aoMoverMouse)
  // saiu do mapa ou começou a arrastar: nada de etiqueta aparecendo depois
  mapa.value.on('mouseout', esconderEtiqueta)
  mapa.value.on('movestart', esconderEtiqueta)
}

/** Enquadra o estado inteiro e não deixa sair dele (arrastar nem afastar). */
function prenderNoParana() {
  mapa.value.setMaxBounds(limitesParana.pad(0.05))
  mapa.value.options.maxBoundsViscosity = 1.0
  // Sem animação: animado, o getZoom() abaixo ainda devolve o zoom de antes e o mínimo
  // ficava um pouco menor que o do estado inteiro (dava pra afastar meio nível).
  mapa.value.fitBounds(limitesParana, { animate: false })
  mapa.value.setMinZoom(mapa.value.getZoom())
}

/** Botão "ver o Paraná inteiro": volta o enquadramento sem mexer na seleção. */
function verParanaInteiro() {
  mapa.value?.closePopup?.()
  mapa.value?.fitBounds(limitesParana)
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
    mascara = L.polygon([mundo, ...aneisExternos(contorno)], {
      pane: 'mascara',
      stroke: false,
      fillColor: corDaMascara(),
      fillOpacity: 1,
      interactive: false,
    }).addTo(mapa.value)
    contornoParana = L.geoJSON(contorno, {
      pane: 'mascara',
      style: { color: corDoContorno(), weight: 2, fill: false },
      interactive: false,
    }).addTo(mapa.value)
    limitesParana = contornoParana.getBounds()
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
  alternar(camadaComDados, camadasVisiveis.value.comDados)
  alternar(camadaComDadosContorno, camadasVisiveis.value.comDados)
  alternar(camadaImoveis, camadasVisiveis.value.imoveis)
}

/**
 * Destaca os municípios que têm imóveis publicados (os únicos clicáveis com resultado).
 * Mesma camada de municípios, com o estilo extra e filtrada pelos códigos que vieram dos
 * indicadores — quando novos municípios forem publicados, entram sozinhos.
 */
function atualizarMunicipiosComDados() {
  if (!mapa.value) return
  for (const camada of [camadaComDados, camadaComDadosContorno]) {
    if (camada) mapa.value.removeLayer(camada)
  }
  camadaComDados = null
  camadaComDadosContorno = null
  const codigos = municipios.value.map((m) => m.codIbge).filter((c) => c != null)
  if (codigos.length) {
    const filtro = `COD_NATURAL IN (${codigos.map((c) => `'${Number(c)}'`).join(',')})`
    // zIndex: municípios 5, preenchimento 6, imóveis 10, contorno 11, alertas 20 em diante
    camadaComDados = wms(CAMADA_MUNICIPIO, { styles: ESTILO_MUNICIPIO_COM_DADOS, CQL_FILTER: filtro, zIndex: 6 })
    camadaComDadosContorno = wms(CAMADA_MUNICIPIO, {
      styles: ESTILO_MUNICIPIO_COM_DADOS_CONTORNO,
      CQL_FILTER: filtro,
      zIndex: 11,
    })
  }
  sincronizarCamadas()
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

// ------------------------------------------------- informações no mapa (clique e mouse)

/** Texto que vem dos dados (nome de município, código CAR) entra no HTML do Leaflet escapado. */
function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function singularOuPlural(n, singular, varios) {
  return n === 1 ? singular : varios
}

/**
 * O que se sabe do item sob o ponto, montado só com o que a tela já carregou (indicadores
 * por município e por imóvel) — o GeoServer só diz qual é o item.
 */
function resumoDoItem(tipo, item) {
  if (tipo === 'imovel') {
    const imovel = imoveis.value.find((i) => i.codImovel === item.codigo)
    if (!imovel) {
      return { titulo: codigoCurto(item.codigo), tituloCompleto: item.codigo, aviso: 'Imóvel sem indicadores publicados.' }
    }
    const alertas = RESTRICOES.filter((c) => cruza(imovel, c)).map((c) => c.indicador)
    return {
      titulo: codigoCurto(imovel.codImovel),
      tituloCompleto: imovel.codImovel,
      subtitulo: imovel.municipioNome,
      linhas: [`Área: ${formatarNumero(imovel.areaHa, 2)} ha`],
      // Mesmo termo do KPI "Interseções" (camadas de alerta cruzadas)
      alerta: alertas.length
        ? {
            tom: 'erro',
            texto: `Cruza ${alertas.length} ${singularOuPlural(alertas.length, 'camada', 'camadas')} de alerta: ${alertas.join(', ')}`,
          }
        : { tom: 'sucesso', texto: 'Sem interseção com camadas de alerta' },
      indicadores: imovel,
    }
  }
  const municipio = municipios.value.find((m) => String(m.codIbge) === item.codigo)
  if (!municipio) {
    return { titulo: item.rotulo || item.codigo, aviso: 'Ainda sem imóveis com indicadores publicados.' }
  }
  const n = municipio.qtdImoveisComIntersecao ?? 0
  return {
    titulo: municipio.nome || item.rotulo || item.codigo,
    linhas: [
      `${formatarInteiro(municipio.qtdImoveis)} ${singularOuPlural(municipio.qtdImoveis, 'imóvel', 'imóveis')} · ${formatarNumero(municipio.areaTotalHa, 0)} ha`,
    ],
    alerta: n
      ? { tom: 'erro', texto: `${formatarInteiro(n)} ${singularOuPlural(n, 'imóvel', 'imóveis')} com sobreposição` }
      : { tom: 'sucesso', texto: 'Nenhum imóvel com sobreposição' },
    indicadores: municipio,
  }
}

function htmlCabecalho(r) {
  const titulo = `<strong class="info-titulo" title="${escaparHtml(r.tituloCompleto || r.titulo)}">${escaparHtml(r.titulo)}</strong>`
  const subtitulo = r.subtitulo ? `<span class="info-sub">${escaparHtml(r.subtitulo)}</span>` : ''
  return titulo + subtitulo
}

/** Balão do clique: tudo, inclusive os valores dos 7 indicadores (sem classificar). */
function htmlDoBalao(r) {
  if (r.aviso) return `<div class="info-mapa">${htmlCabecalho(r)}<span class="info-aviso">${escaparHtml(r.aviso)}</span></div>`
  const linhas = (r.linhas || []).map((l) => `<span class="info-linha">${escaparHtml(l)}</span>`).join('')
  const alerta = `<span class="info-alerta info-alerta--${r.alerta.tom}">${escaparHtml(r.alerta.texto)}</span>`
  const indicadores = indicadoresOrdenados.value
    .map((t) => {
      const valor = r.indicadores[campoDoIndicador(t.codigo)]
      const unidade = valor != null ? `<small>${escaparHtml(t.unidadeSimbolo || '%')}</small>` : ''
      return `<span class="info-indicador"><b>${escaparHtml(t.codigo)}</b>${formatarNumero(valor)} ${unidade}</span>`
    })
    .join('')
  return `<div class="info-mapa">${htmlCabecalho(r)}${linhas}${alerta}<div class="info-indicadores">${indicadores}</div></div>`
}

/** Etiqueta do mouse: só o essencial. */
function htmlDaEtiqueta(r) {
  const resumo = r.aviso ? escaparHtml(r.aviso) : escaparHtml(r.alerta.texto)
  return `<div class="info-mapa info-mapa--curta">${htmlCabecalho(r)}<span class="info-linha">${resumo}</span></div>`
}

/** Clique no mapa seleciona o município ou o imóvel sob o cursor e abre o balão dele. */
async function aoClicarNoMapa(evento) {
  if (!limitesParana.contains(evento.latlng)) return
  const { lat, lng } = evento.latlng
  aviso.value = ''
  esconderEtiqueta()
  try {
    const tipo = visao.value === 'imovel' ? 'imovel' : 'municipio'
    const item = await identificarNoPonto(tipo === 'imovel' ? CAMADA_IMOVEL : CAMADA_MUNICIPIO, lng, lat)
    if (!item || !mapa.value) return
    L.popup({ maxWidth: 320, minWidth: 240, className: 'balao-mapa' })
      .setLatLng(evento.latlng)
      .setContent(htmlDoBalao(resumoDoItem(tipo, item)))
      .openOn(mapa.value)
    if (tipo === 'imovel') {
      imovelSelecionado.value = item.codigo
      buscaImovel.value = item.codigo
    } else if (municipios.value.some((m) => String(m.codIbge) === item.codigo)) {
      municipioSelecionado.value = item.codigo
    } else {
      aviso.value = 'Este município ainda não tem imóveis com indicadores publicados.'
    }
  } catch (e) {
    erro.value = `Falha ao identificar o ponto clicado: ${e.message}`
  }
}

/**
 * Mouse: o mapa é imagem (WMS), então o navegador não sabe o que está embaixo do
 * cursor. Quando o mouse para por ESPERA_MOUSE_MS, pergunta ao GeoServer (a mesma
 * consulta do clique) e mostra a etiqueta. Mexeu de novo, some; resposta que chega
 * depois de o mouse ter mexido é descartada (consultaMouse).
 */
const ESPERA_MOUSE_MS = 400
let temporizadorMouse = null
let consultaMouse = 0
let etiquetaMouse = null

function esconderEtiqueta() {
  clearTimeout(temporizadorMouse)
  consultaMouse++
  if (etiquetaMouse && mapa.value) mapa.value.closeTooltip(etiquetaMouse)
  etiquetaMouse = null
}

function aoMoverMouse(evento) {
  esconderEtiqueta()
  temporizadorMouse = setTimeout(() => mostrarEtiqueta(evento.latlng), ESPERA_MOUSE_MS)
}

async function mostrarEtiqueta(latlng) {
  if (!mapa.value || !limitesParana.contains(latlng)) return
  const consulta = ++consultaMouse
  const tipo = visao.value === 'imovel' ? 'imovel' : 'municipio'
  try {
    const item = await identificarNoPonto(tipo === 'imovel' ? CAMADA_IMOVEL : CAMADA_MUNICIPIO, latlng.lng, latlng.lat)
    if (consulta !== consultaMouse || !item || !mapa.value) return
    etiquetaMouse = L.tooltip({ direction: 'top', offset: [0, -10], className: 'etiqueta-mapa', opacity: 1 })
      .setLatLng(latlng)
      .setContent(htmlDaEtiqueta(resumoDoItem(tipo, item)))
    mapa.value.openTooltip(etiquetaMouse)
  } catch {
    // etiqueta é só ajuda visual: falha na consulta não vira mensagem de erro na tela
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
  listaAlertaCompleta.value = false
  tipoListaAlerta.value = 'sobreposicao'
  gravarSelecaoNaUrl(sel)
  filtrarImoveisNoMapa()
  await comCarregamento(() => destacarSelecao(sel, consulta))
  if (sel) await comCarregamento(() => destacarCruzamentos(sel, consulta))
})

watch(municipios, atualizarMunicipiosComDados)

watch([situacaoCamadas, camadasVisiveis], sincronizarCamadas, { deep: true })

// Trocou o tema com a tela aberta: máscara e contorno acompanham sem recarregar.
watch(() => estadoTema.atual, aplicarCoresDoTema)

onMounted(async () => {
  CAMADAS_NO_MAPA.forEach((c) => (camadasVisiveis.value[c.camada] = true))
  await nextTick()
  iniciarMapa()
  await Promise.all([
    carregar().then(aplicarSelecaoDaUrl),
    comCarregamento(verificarCamadas),
    comCarregamento(desenharContornoParana),
  ])
})

onUnmounted(() => {
  clearTimeout(temporizadorMouse)
  clearTimeout(temporizadorFoco)
  mapa.value?.remove()
  mapa.value = null
})
</script>

<template>
  <div class="pagina-mapa">
    <header class="topo-pagina">
      <div>
        <h1 class="titulo">Indicadores e Resultados</h1>
        <p class="subtitulo">Indicadores e interseções por município ou imóvel rural do Paraná.</p>
      </div>
      <div class="topo-acoes">
        <button
          v-if="podeVerTabela"
          class="btn-secundario"
          data-acao="indicadores"
          :disabled="carregando"
          :title="selecao ? 'Ver este item em tabela' : 'Ver em tabela'"
          @click="verNaTabela"
        >
          Ver em tabela
        </button>
        <button class="btn-secundario" data-acao="limpar" :disabled="carregando || !selecao" @click="limparSelecao">Limpar seleção</button>
      </div>
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
        <span v-if="carregando" class="kpis-nota">· carregando indicadores…</span>
        <span v-if="!selecao" class="kpis-nota">· média ponderada pela área</span>
        <span v-if="dataPublicacao" class="kpis-nota">· indicadores publicados em {{ formatarData(dataPublicacao) }}</span>
      </p>
      <div class="kpis-quantidades">
        <div class="kpi" data-kpi="imoveis">
          <span class="kpi-rotulo">Imóveis</span>
          <span class="kpi-valor">{{ carregando ? '—' : formatarInteiro(kpisQuantidade.imoveis) }}</span>
        </div>
        <div class="kpi" data-kpi="municipios">
          <span class="kpi-rotulo">Municípios</span>
          <span class="kpi-valor">{{ carregando ? '—' : formatarInteiro(kpisQuantidade.municipios) }}</span>
        </div>
        <div class="kpi" data-kpi="intersecoes">
          <span class="kpi-rotulo">Interseções</span>
          <span class="kpi-valor">{{ carregando ? '—' : formatarInteiro(kpisQuantidade.intersecoes) }}</span>
          <span class="kpi-dica">{{ kpisQuantidade.rotuloIntersecoes }}</span>
        </div>
      </div>
      <div class="kpis-indicadores">
        <div
          v-for="t in indicadoresOrdenados"
          :key="t.codigo"
          :data-indicador="t.codigo"
          class="kpi-indicador"
          tabindex="0"
          :aria-describedby="`dica-${t.codigo}`"
        >
          <span class="kpi-rotulo">{{ t.codigo }}</span>
          <span class="kpi-valor">
            {{ formatarNumero(linhaDosKpis?.[campoDoIndicador(t.codigo)]) }}
            <small v-if="linhaDosKpis?.[campoDoIndicador(t.codigo)] != null">{{ t.unidadeSimbolo || '%' }}</small>
          </span>
          <!-- IRL: déficit(-)/excedente(+) de RL frente ao mínimo do bioma, em ha -->
          <span v-if="t.codigo === 'IRL' && linhaDosKpis?.valorIrlDeficitHa != null" class="kpi-dica">
            {{ linhaDosKpis.valorIrlDeficitHa < 0 ? 'Déficit' : 'Excedente' }}:
            {{ formatarNumero(Math.abs(linhaDosKpis.valorIrlDeficitHa)) }} ha
          </span>
          <!-- IAPP: área de APP declarada sem vegetação nativa, em ha -->
          <span v-if="t.codigo === 'IAPP' && linhaDosKpis?.valorIappPassivoHa != null" class="kpi-dica">
            Passivo: {{ formatarNumero(linhaDosKpis.valorIappPassivoHa) }} ha
          </span>
          <!-- Dica com o nome do indicador: a tela é só visual, sem classificar o valor -->
          <div :id="`dica-${t.codigo}`" class="dica-indicador" role="tooltip">
            <strong class="dica-titulo">{{ t.codigo }}</strong>
            <span v-if="t.descricao" class="dica-descricao">{{ t.descricao }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="area-mapa">
      <div class="mapa-coluna">
        <div class="mapa-moldura">
          <div ref="mapaEl" class="mapa" role="application" aria-label="Mapa de cobertura do Paraná"></div>
          <button
            type="button"
            class="mapa-inicio"
            title="Ver o Paraná inteiro"
            aria-label="Ver o Paraná inteiro"
            @click="verParanaInteiro"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <div v-if="mapaCarregando" class="mapa-carregando" role="status" aria-live="polite">
            <span class="mapa-carregando-giro" aria-hidden="true"></span>
            Carregando mapa…
          </div>
        </div>
        <p class="mapa-dica">
          Clique no mapa para selecionar {{ visao === 'imovel' ? 'um imóvel' : 'um município' }}.
          <span v-if="aviso" class="mapa-aviso">{{ aviso }}</span>
        </p>
      </div>

      <aside ref="painelAvisoEl" class="painel-aviso" aria-live="polite">
        <h2 class="painel-titulo">Aviso de interseção</h2>
        <p v-if="!selecao" class="painel-vazio">
          Selecione um município ou imóvel para ver o aviso dele. Abaixo, a situação de todo o recorte.
        </p>
        <div v-else-if="resumoAviso" :class="['resumo-aviso', `resumo-aviso--${resumoAviso.tom}`]">
          {{ resumoAviso.texto }}
          <template v-if="resumoAviso.alertas">
            <button
              v-for="c in resumoAviso.alertas"
              :key="c.indicador"
              type="button"
              class="resumo-codigo"
              :data-ir-para="c.indicador"
              :title="`Ver o motivo do alerta de ${c.indicador}`"
              @click="irParaCamada(c)"
            >
              {{ c.indicador }}
            </button>
          </template>
        </div>

        <div v-if="imoveisComAlerta.length || imoveisSemReservaLegal.length" class="lista-alerta">
          <h3 class="lista-alerta-titulo">Imóveis com alerta</h3>
          <div class="lista-alerta-abas" role="tablist" aria-label="Tipo de alerta">
            <button
              type="button"
              role="tab"
              data-lista="sobreposicao"
              :aria-selected="tipoListaEfetivo === 'sobreposicao'"
              :class="['lista-alerta-aba', { 'lista-alerta-aba--ativa': tipoListaEfetivo === 'sobreposicao' }]"
              :disabled="!imoveisComAlerta.length"
              @click="trocarListaAlerta('sobreposicao')"
            >
              Sobreposição ({{ formatarInteiro(imoveisComAlerta.length) }})
            </button>
            <button
              type="button"
              role="tab"
              data-lista="reservaLegal"
              :aria-selected="tipoListaEfetivo === 'reservaLegal'"
              :class="['lista-alerta-aba', { 'lista-alerta-aba--ativa': tipoListaEfetivo === 'reservaLegal' }]"
              :disabled="!imoveisSemReservaLegal.length"
              @click="trocarListaAlerta('reservaLegal')"
            >
              Sem Reserva Legal ({{ formatarInteiro(imoveisSemReservaLegal.length) }})
            </button>
          </div>
          <ul>
            <li v-for="item in imoveisComAlertaVisiveis" :key="item.imovel.codImovel">
              <button
                type="button"
                class="lista-alerta-item"
                :title="`${item.imovel.codImovel} — clique para ver no mapa`"
                @click="selecionarImovelDaLista(item.imovel)"
              >
                <span class="lista-alerta-codigo">{{ codigoCurto(item.imovel.codImovel) }}</span>
                <span class="lista-alerta-chips">
                  <span v-for="c in item.alertas" :key="c.indicador" class="lista-alerta-chip" :style="{ '--cor': c.cor }">
                    {{ c.indicador }} {{ valorComUnidade(tipoDoIndicador(c.indicador), item.imovel[c.campo]) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <button
            v-if="listaAlertaAtual.length > LIMITE_LISTA_ALERTA"
            type="button"
            class="lista-alerta-mais"
            @click="listaAlertaCompleta = !listaAlertaCompleta"
          >
            {{ listaAlertaCompleta ? 'Mostrar menos' : `Mostrar todos (${formatarInteiro(listaAlertaAtual.length)})` }}
          </button>
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
              <input v-model="camadasVisiveis.comDados" type="checkbox" />
              <span class="amostra" style="--cor: #7c3aed"></span>
              Municípios com imóveis publicados
            </label>
          </li>
          <li class="item-camada">
            <label class="camada-toggle">
              <input v-model="camadasVisiveis.imoveis" type="checkbox" />
              <span class="amostra" style="--cor: #2563eb"></span>
              Imóveis rurais (CAR)
            </label>
          </li>
          <li
            v-for="c in CAMADAS_INDICADOR"
            :key="c.indicador"
            :class="['item-camada', { 'item-camada--foco': camadaEmFoco === c.indicador }]"
            :data-camada="c.indicador"
          >
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

.topo-acoes {
  display: flex;
  gap: 0.5rem;
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

/* Menu moderno da LIZARDS-38 (appearance: base-select): o select vira flex sem alinhar
   o conteúdo, e com a altura fixa acima o texto e a seta subiam pro topo da caixa. */
@supports (appearance: base-select) {
  .campo select {
    align-items: center;
  }
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
  position: relative;
  padding: 0.55rem 0.7rem;
  border-radius: var(--raio-md);
  border: 1px solid var(--status-neutro-borda);
  background: var(--status-neutro-bg);
  text-align: center;
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

/* Dica do KPI: aparece no mouse e no foco do teclado, abaixo do card. */
.dica-indicador {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 50%;
  z-index: 1100;
  width: 17rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.7rem 0.8rem;
  border-radius: var(--raio-md);
  border: 1px solid var(--cor-slate-200);
  background: var(--cor-branco);
  box-shadow: var(--sombra-lg);
  text-align: left;
  font-size: 0.78rem;
  color: var(--cor-slate-600);
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, -0.25rem);
  transition: opacity 0.12s, transform 0.12s, visibility 0.12s;
  pointer-events: none;
}

/* Os dois últimos cards ficam na borda direita: a dica alinha pela direita do card. */
.kpi-indicador:nth-last-child(-n + 2) .dica-indicador {
  left: auto;
  right: 0;
  transform: translateY(-0.25rem);
}

.kpi-indicador:hover .dica-indicador,
.kpi-indicador:focus-visible .dica-indicador {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}

.kpi-indicador:nth-last-child(-n + 2):hover .dica-indicador,
.kpi-indicador:nth-last-child(-n + 2):focus-visible .dica-indicador {
  transform: none;
}

.kpi-indicador:focus-visible {
  outline: 2px solid var(--cor-primaria);
  outline-offset: 2px;
}

.dica-titulo {
  font-size: 0.85rem;
  color: var(--cor-slate-900);
}

.dica-descricao {
  color: var(--cor-slate-700);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .dica-indicador {
    transition: none;
  }
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

.mapa-moldura {
  position: relative;
}

/* Acompanha a altura da janela (60% dela, entre 560px e 720px), para caber na tela sem
   rolar numa janela de 1000px. O ganho maior de tamanho vem do zoom fracionado
   (zoomSnap), que deixa o Paraná ocupar o mapa sem faixa vazia. */
.mapa {
  height: clamp(560px, 60vh, 720px);
  border-radius: var(--raio-lg);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-sm);
  overflow: hidden;
  z-index: 0;
  background: var(--cor-slate-100);
}

/* Balão do clique e etiqueta do mouse: o Leaflet cria fora do escopo do Vue, dentro
   do container do mapa — por isso o :deep() a partir de .mapa. */
.mapa :deep(.info-mapa) {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--cor-slate-700);
}

.mapa :deep(.info-titulo) {
  font-size: 0.9rem;
  color: var(--cor-slate-900);
}

.mapa :deep(.info-sub),
.mapa :deep(.info-linha) {
  color: var(--cor-slate-500);
}

.mapa :deep(.info-aviso) {
  color: var(--status-alerta-texto);
  font-weight: 600;
}

.mapa :deep(.info-alerta) {
  align-self: flex-start;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 700;
  border: 1px solid var(--status-neutro-borda);
}

.mapa :deep(.info-alerta--erro) {
  background: var(--status-erro-bg);
  border-color: var(--status-erro-borda);
  color: var(--status-erro-texto);
}

.mapa :deep(.info-alerta--sucesso) {
  background: var(--status-sucesso-bg);
  border-color: var(--status-sucesso-borda);
  color: var(--status-sucesso-texto);
}

.mapa :deep(.info-indicadores) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.mapa :deep(.info-indicador) {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.25rem 0.2rem;
  border-radius: var(--raio-sm);
  border: 1px solid var(--status-neutro-borda);
  background: var(--status-neutro-bg);
  color: var(--cor-slate-900);
  font-weight: 700;
}

.mapa :deep(.info-indicador b) {
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  color: var(--cor-slate-500);
}

.mapa :deep(.info-indicador small) {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--cor-slate-500);
}

.mapa :deep(.info-mapa--curta) {
  min-width: 11rem;
  max-width: 16rem;
  white-space: normal;
}

/* Logo abaixo do + e − do Leaflet, com a mesma aparência (leaflet-bar). */
.mapa-inicio {
  position: absolute;
  top: 82px;
  left: 10px;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 2px solid rgb(0 0 0 / 20%);
  border-radius: 4px;
  background: var(--cor-branco);
  color: var(--cor-slate-800);
  cursor: pointer;
}

.mapa-inicio:hover {
  background: var(--cor-slate-100);
}

/* Fica no canto direito: o esquerdo é do controle de zoom. Acima dos painéis do Leaflet. */
.mapa-carregando {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: var(--raio-md);
  border: 1px solid var(--cor-slate-200);
  background: var(--cor-branco);
  box-shadow: var(--sombra-sm);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--cor-slate-700);
  pointer-events: none;
}

.mapa-carregando-giro {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  border: 2px solid var(--cor-slate-200);
  border-top-color: var(--cor-primaria);
  animation: mapa-girar 0.8s linear infinite;
}

@keyframes mapa-girar {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mapa-carregando-giro {
    animation: none;
  }
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

.lista-alerta {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.resumo-codigo {
  margin-left: 0.3rem;
  padding: 0.05rem 0.45rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.resumo-codigo:hover,
.resumo-codigo:focus-visible {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.item-camada--foco {
  border-radius: var(--raio-md);
  box-shadow: 0 0 0 2px var(--cor-primaria);
  transition: box-shadow 0.2s;
}

.lista-alerta-abas {
  display: flex;
  gap: 0.25rem;
  padding: 0.15rem;
  border-radius: var(--raio-md);
  background: var(--cor-slate-100);
  border: 1px solid var(--cor-slate-200);
}

.lista-alerta-aba {
  flex: 1;
  padding: 0.3rem 0.4rem;
  border: none;
  border-radius: var(--raio-sm);
  background: transparent;
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--cor-slate-500);
  cursor: pointer;
}

.lista-alerta-aba--ativa {
  background: var(--cor-branco);
  color: var(--cor-primaria);
  box-shadow: var(--sombra-sm);
}

.lista-alerta-aba:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lista-alerta-titulo {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--cor-slate-700);
}

.lista-alerta ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 16rem;
  overflow-y: auto;
}

.lista-alerta-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--cor-slate-200);
  border-radius: var(--raio-md);
  background: var(--cor-branco);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.lista-alerta-item:hover,
.lista-alerta-item:focus-visible {
  border-color: var(--cor-primaria);
}

.lista-alerta-codigo {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: var(--cor-slate-800);
}

.lista-alerta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.lista-alerta-chip {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--cor);
  border: 1px solid var(--cor);
  background: color-mix(in srgb, var(--cor) 10%, transparent);
}

.lista-alerta-mais {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--cor-primaria);
  cursor: pointer;
}

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
    height: 460px;
  }
}

/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda.
   O resto da tela usa só as variáveis do style.css, que o escuro já remapeia;
   aqui fica só o que o Leaflet cria por JavaScript (sem a marca de escopo do Vue,
   por isso o :deep() a partir do container).
   ========================================================================== */

/* Só o fundo do OpenStreetMap é escurecido. As camadas do GeoServer também são tiles,
   mas ficam no painel padrão de tiles e mantêm as cores da legenda (LIZARDS-35). */
:root[data-tema="escuro"] .mapa :deep(.leaflet-fundo-pane) {
  filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-bar) {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-bar a) {
  background-color: var(--cor-superficie-elevada);
  border-bottom-color: var(--cor-borda);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-bar a:hover) {
  background-color: var(--cor-borda);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-bar a.leaflet-disabled) {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-control-attribution) {
  background: rgb(21 28 36 / 80%);
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-control-attribution a) {
  color: var(--cor-link);
}

/* Balão do clique (popup do Leaflet) */
:root[data-tema="escuro"] .mapa :deep(.leaflet-popup-content-wrapper),
:root[data-tema="escuro"] .mapa :deep(.leaflet-popup-tip) {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .mapa :deep(.leaflet-popup-close-button) {
  color: var(--cor-texto-terciario);
}

/* Dica dos KPIs: fundo elevado, como o balão do mapa */
:root[data-tema="escuro"] .dica-indicador {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
}

/* Régua de escala */
:root[data-tema="escuro"] .mapa :deep(.leaflet-control-scale-line) {
  background: rgb(21 28 36 / 80%);
  border-color: var(--cor-texto-terciario);
  color: var(--cor-texto);
}

/* Botão "ver o Paraná inteiro" (fora do .mapa, mesmo visual do zoom no escuro) */
:root[data-tema="escuro"] .mapa-inicio {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .mapa-inicio:hover {
  background: var(--cor-borda);
}

/* Tooltip das feições destacadas e etiqueta do mouse */
:root[data-tema="escuro"] .mapa :deep(.leaflet-tooltip) {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
  color: var(--cor-texto);
}
</style>

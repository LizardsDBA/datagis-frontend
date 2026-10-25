/**
 * Camadas do mapa de cobertura (LIZARDS-35), servidas pelo GeoServer.
 *
 * O navegador nunca fala com o GeoServer direto: tudo passa pelo proxy do backend
 * (/api/indicadores/geoserver/{wms|wfs}), com o token do Keycloak, e o backend só deixa
 * passar as camadas vw_mapa_* e operações de leitura.
 *
 * O GeoServer desenha o mapa (WMS) e diz QUAIS feições cruzam a seleção (WFS + CQL
 * INTERSECTS, que vira SDO_RELATE no Oracle) — serve pra destacar no mapa. Se há ou não
 * alerta, e os KPIs, vêm dos indicadores (consultaIndicadoresService): a geometria do mapa
 * é simplificada (~5 m) e erraria nas sobreposições pequenas.
 */
import { apiFetch } from './http'

export const WORKSPACE = 'datagis'
export const URL_WMS = '/api/indicadores/geoserver/wms'
const URL_WFS = '/api/indicadores/geoserver/wfs'

export const CAMADA_LIMITE_PR = `${WORKSPACE}:vw_mapa_limite_pr`
export const CAMADA_MUNICIPIO = `${WORKSPACE}:vw_mapa_municipio`
export const CAMADA_IMOVEL = `${WORKSPACE}:vw_mapa_imovel`

/** Literal de texto em CQL: aspas simples são escapadas dobrando. */
export function literalCql(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`
}

/**
 * Geometria da seleção buscada pelo próprio GeoServer (querySingle, extensão
 * querylayer): o polígono nunca precisa viajar na URL. O filtro interno vai como texto
 * dentro de outro literal, por isso as aspas dele são dobradas de novo.
 */
export function geometriaDaSelecao(selecao) {
  const camada = selecao.tipo === 'imovel' ? CAMADA_IMOVEL : CAMADA_MUNICIPIO
  const filtro = `COD_NATURAL=${literalCql(selecao.codigo)}`
  return `querySingle('${camada}','GEOMETRIA',${literalCql(filtro)})`
}

async function getFeature(params) {
  const consulta = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    ...params,
  })
  const resposta = await apiFetch(`${URL_WFS}?${consulta}`)
  const texto = await resposta.text()
  if (!resposta.ok) {
    let motivo = `HTTP ${resposta.status}`
    try {
      motivo = JSON.parse(texto).erro || motivo
    } catch {
      // corpo não é JSON (ex.: erro do próprio GeoServer)
    }
    throw new Error(motivo)
  }
  // O GeoServer devolve erro como XML com HTTP 200 (ows:ExceptionReport).
  if (texto.includes('ExceptionReport')) {
    const motivo = texto.match(/<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/)
    throw new Error(motivo ? motivo[1].trim() : 'Erro do GeoServer')
  }
  return texto
}

/** Quantas feições a camada tem publicadas, opcionalmente filtradas por CQL. */
export async function contarFeicoes(camada, cql) {
  const params = { TYPENAMES: camada, RESULTTYPE: 'hits' }
  if (cql) params.CQL_FILTER = cql
  const xml = await getFeature(params)
  const total = xml.match(/numberMatched="(\d+)"/)
  return total ? Number(total[1]) : 0
}

/** Feições da camada em GeoJSON (lon/lat), filtradas por CQL. */
export async function buscarGeoJson(camada, cql, propriedades) {
  const params = {
    TYPENAMES: camada,
    OUTPUTFORMAT: 'application/json',
    SRSNAME: 'EPSG:4326',
  }
  if (cql) params.CQL_FILTER = cql
  if (propriedades) params.PROPERTYNAME = propriedades
  return JSON.parse(await getFeature(params))
}

/** Contorno do Paraná (camada LIMITE_PR da Gold) — a moldura do mapa. */
export function buscarContornoParana() {
  return buscarGeoJson(CAMADA_LIMITE_PR)
}

/** Polígono do município ou imóvel selecionado, pra destacar e enquadrar. */
export function buscarGeometriaDaSelecao(selecao) {
  const camada = selecao.tipo === 'imovel' ? CAMADA_IMOVEL : CAMADA_MUNICIPIO
  return buscarGeoJson(camada, `COD_NATURAL=${literalCql(selecao.codigo)}`)
}

/** Feições da camada que cruzam a seleção — só pra destacar no mapa. */
export function buscarFeicoesQueCruzam(camada, selecao) {
  return buscarGeoJson(
    camada,
    `INTERSECTS(GEOMETRIA, ${geometriaDaSelecao(selecao)})`,
    'COD_NATURAL,ROTULO,GEOMETRIA',
  )
}

/**
 * Município ou imóvel sob o ponto (clique ou mouse parado): `{ codigo, rotulo }`, ou null.
 * O rótulo é o nome do município (ou o código do imóvel) e serve pra mostrar o nome até
 * de município que ainda não tem imóvel publicado — esse não está na lista de indicadores.
 *
 * O ponto vai com o SRID explícito (EWKT): no WFS 2.0 o GeoServer lê um POINT sem SRID
 * no sistema da camada, e o EPSG:4674 oficial é latitude-primeiro — POINT(lon lat)
 * caía fora do Paraná e o clique nunca achava nada. SRID=4326 é o que o Leaflet
 * entrega de fato (WGS84, lon/lat), e o GeoServer converte sozinho.
 */
export async function identificarNoPonto(camada, lng, lat) {
  const geo = await buscarGeoJson(camada, `INTERSECTS(GEOMETRIA, SRID=4326;POINT(${lng} ${lat}))`, 'COD_NATURAL,ROTULO')
  const propriedades = geo.features[0]?.properties
  if (!propriedades?.COD_NATURAL) return null
  return { codigo: String(propriedades.COD_NATURAL), rotulo: propriedades.ROTULO ?? null }
}

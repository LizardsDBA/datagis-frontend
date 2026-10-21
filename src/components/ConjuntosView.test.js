import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import L from 'leaflet'
import ConjuntosView from './ConjuntosView.vue'
import { listarTiposIndicador } from '../services/goldService'
import { listarIndicadoresPorImovel, listarIndicadoresPorMunicipio } from '../services/consultaIndicadoresService'
import {
  buscarContornoParana,
  buscarFeicoesQueCruzam,
  buscarGeometriaDaSelecao,
  contarFeicoes,
  identificarNoPonto,
} from '../services/geoserverService'
import { camadaWmsAutenticada } from './camadaWmsAutenticada'

vi.mock('../services/goldService', () => ({ listarTiposIndicador: vi.fn() }))
vi.mock('../services/consultaIndicadoresService', () => ({
  listarIndicadoresPorImovel: vi.fn(),
  listarIndicadoresPorMunicipio: vi.fn(),
}))
vi.mock('../services/geoserverService', () => ({
  URL_WMS: '/api/indicadores/geoserver/wms',
  CAMADA_MUNICIPIO: 'datagis:vw_mapa_municipio',
  CAMADA_IMOVEL: 'datagis:vw_mapa_imovel',
  buscarContornoParana: vi.fn(),
  buscarFeicoesQueCruzam: vi.fn(),
  buscarGeometriaDaSelecao: vi.fn(),
  contarFeicoes: vi.fn(),
  identificarNoPonto: vi.fn(),
}))

// Camada WMS falsa: registra no mapa falso ao entrar e guarda o filtro aplicado.
vi.mock('./camadaWmsAutenticada', () => ({
  camadaWmsAutenticada: vi.fn((url, opcoes) => ({
    opcoes,
    setParams: vi.fn(),
    addTo(m) {
      m._camadas.add(this)
      return this
    },
  })),
}))

// Leaflet isolado: nada de tile real nem layout do navegador.
const { mapaFalso, limites } = vi.hoisted(() => {
  const limites = { pad: () => limites, contains: () => true }
  const mapaFalso = {}
  return { mapaFalso, limites }
})
vi.mock('leaflet', () => {
  const camada = () => ({
    addTo(m) {
      m?._camadas?.add(this)
      return this
    },
    getBounds: () => limites,
  })
  return {
    default: {
      latLngBounds: vi.fn(() => limites),
      map: vi.fn(() => Object.assign(mapaFalso, {
        _camadas: new Set(),
        _cliques: [],
        options: {},
        setMaxBounds: vi.fn(),
        fitBounds: vi.fn(),
        setMinZoom: vi.fn(),
        getZoom: () => 7,
        on: vi.fn((evento, fn) => mapaFalso._cliques.push(fn)),
        createPane: vi.fn(),
        getPane: () => ({ style: {} }),
        hasLayer: (l) => mapaFalso._camadas.has(l),
        removeLayer: vi.fn((l) => mapaFalso._camadas.delete(l)),
        remove: vi.fn(),
      })),
      tileLayer: vi.fn(camada),
      polygon: vi.fn(camada),
      geoJSON: vi.fn(camada),
      layerGroup: vi.fn(camada),
      circleMarker: vi.fn(camada),
    },
  }
})

const TIPOS = [
  { codigo: 'ICV', ordemExibicao: 1, sentido: 'MAIOR_MELHOR', limiteBom: 30, limiteAtencao: 15, unidadeSimbolo: '%' },
  { codigo: 'IRL', ordemExibicao: 2, sentido: 'MAIOR_MELHOR', limiteBom: 20, limiteAtencao: 20, unidadeSimbolo: '%' },
  { codigo: 'IAPP', ordemExibicao: 3, sentido: 'MAIOR_MELHOR', limiteBom: 70, limiteAtencao: 40, unidadeSimbolo: '%' },
  { codigo: 'ISAP', ordemExibicao: 4, sentido: 'MENOR_MELHOR', limiteBom: 0, limiteAtencao: 5, unidadeSimbolo: '%' },
  { codigo: 'IAE', ordemExibicao: 5, sentido: 'MENOR_MELHOR', limiteBom: 0, limiteAtencao: 5, unidadeSimbolo: '%' },
  { codigo: 'IDESMAT', ordemExibicao: 6, sentido: 'MENOR_MELHOR', limiteBom: 0, limiteAtencao: 5, unidadeSimbolo: '%' },
  { codigo: 'IFC', ordemExibicao: 7, sentido: 'MENOR_MELHOR', limiteBom: 0, limiteAtencao: 1, unidadeSimbolo: 'focos/1.000 ha' },
]

const MUNICIPIOS = [
  { codIbge: 4106902, nome: 'Curitiba', qtdImoveis: 1, qtdImoveisComIntersecao: 0, areaTotalHa: 50, valorIcv: 10, valorIrl: 22, valorIapp: null, valorIsap: 0, valorIae: 0, valorIdesmat: 0, valorIfc: 0 },
  { codIbge: 4119905, nome: 'Ponta Grossa', qtdImoveis: 2, qtdImoveisComIntersecao: 1, areaTotalHa: 400, valorIcv: 20, valorIrl: 18.75, valorIapp: 50, valorIsap: 0, valorIae: 1.25, valorIdesmat: 0, valorIfc: 0 },
]

// PR-PG-A: cruza embargo e não declarou Reserva Legal. PR-PG-B: em ordem.
const IMOVEIS = [
  { codImovel: 'PR-4106902-CTBA', municipioCodIbge: 4106902, municipioNome: 'Curitiba', areaHa: 50, valorIcv: 10, valorIrl: 22, valorIapp: null, valorIsap: 0, valorIae: 0, valorIdesmat: 0, valorIfc: 0, dataPublicacao: '2026-10-20T19:44:00' },
  { codImovel: 'PR-4119905-A', municipioCodIbge: 4119905, municipioNome: 'Ponta Grossa', areaHa: 100, valorIcv: 50, valorIrl: 0, valorIapp: 50, valorIsap: 0, valorIae: 5, valorIdesmat: 0, valorIfc: 0, dataPublicacao: '2026-10-20T19:44:00' },
  { codImovel: 'PR-4119905-B', municipioCodIbge: 4119905, municipioNome: 'Ponta Grossa', areaHa: 300, valorIcv: 10, valorIrl: 25, valorIapp: 50, valorIsap: 0, valorIae: 0, valorIdesmat: 0, valorIfc: 0, dataPublicacao: '2026-10-20T19:44:00' },
]

const COLECAO = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-50, -25], [-49, -25], [-49, -24], [-50, -25]]] } }] }

let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  listarTiposIndicador.mockResolvedValue(TIPOS)
  listarIndicadoresPorMunicipio.mockResolvedValue(MUNICIPIOS)
  listarIndicadoresPorImovel.mockResolvedValue(IMOVEIS)
  // Hoje só o embargo tem dado publicado no mapa.
  contarFeicoes.mockImplementation(async (camada) => (camada === 'datagis:vw_mapa_embargo' ? 124 : 0))
  buscarContornoParana.mockResolvedValue(COLECAO)
  buscarGeometriaDaSelecao.mockResolvedValue(COLECAO)
  buscarFeicoesQueCruzam.mockResolvedValue({ type: 'FeatureCollection', features: [{ properties: {} }, { properties: {} }] })
  identificarNoPonto.mockResolvedValue(null)
})
afterEach(() => wrapper?.unmount())

async function abrir() {
  wrapper = mount(ConjuntosView, { attachTo: document.body })
  await flushPromises()
}

function kpi(nome) {
  return wrapper.get(`[data-kpi="${nome}"] .kpi-valor`).text()
}

function indicador(codigo) {
  return wrapper.get(`[data-indicador="${codigo}"]`)
}

function avisoDa(indicadorCodigo) {
  return wrapper.get(`[data-camada="${indicadorCodigo}"] .badge-tag`)
}

async function selecionarMunicipio(cod) {
  await wrapper.get('#select-municipio').setValue(String(cod))
  await flushPromises()
}

async function selecionarImovel(cod) {
  await wrapper.findAll('.chave')[1].trigger('click')
  const campo = wrapper.get('#input-imovel')
  await campo.setValue(cod)
  await campo.trigger('change')
  await flushPromises()
}

describe('ConjuntosView — mapa de cobertura', () => {
  it('não tem mais o cadastro de conjunto', async () => {
    await abrir()
    expect(wrapper.text()).not.toContain('Novo Conjunto')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('KPI geral: soma dos municípios e imóveis com sobreposição vindos do backend', async () => {
    await abrir()
    expect(kpi('imoveis')).toBe('3')
    expect(kpi('municipios')).toBe('2')
    expect(kpi('intersecoes')).toBe('1')
    expect(wrapper.get('[data-kpi="intersecoes"]').text()).toContain('imóvel com sobreposição')
  })

  it('indicador geral é média ponderada pela área, e indicador sem valor fica de fora', async () => {
    await abrir()
    // ICV: (10*50 + 50*100 + 10*300) / 450 = 18,9
    expect(indicador('ICV').text()).toContain('18,9')
    // IAPP: Curitiba sem valor nao entra: (50*100 + 50*300) / 400 = 50,0
    expect(indicador('IAPP').text()).toContain('50,0')
  })

  it('pinta o indicador pela faixa do catálogo, respeitando o sentido', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-A')
    expect(indicador('IAE').classes()).toContain('kpi-indicador--alerta') // 5 <= limiteAtencao, MENOR_MELHOR
    expect(indicador('ICV').classes()).toContain('kpi-indicador--sucesso') // 50 >= 30
    expect(indicador('IRL').classes()).toContain('kpi-indicador--erro') // 0 < 20
  })

  it('selecionar município troca os KPIs pelos dele', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    expect(kpi('imoveis')).toBe('2')
    expect(kpi('municipios')).toBe('1')
    expect(kpi('intersecoes')).toBe('1')
    expect(indicador('IAE').text()).toContain('1,3')
    expect(wrapper.text()).toContain('KPIs de Ponta Grossa')
  })

  it('aviso do município conta os imóveis dele pelos valores dos indicadores', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    expect(avisoDa('IAE').text()).toBe('1 imóvel intersecta')
    expect(avisoDa('IAE').classes()).toContain('badge-tag--erro')
    expect(avisoDa('ISAP').text()).toBe('Nenhum imóvel intersecta')
    expect(avisoDa('IRL').text()).toBe('1 imóvel sem Reserva Legal declarada')
    expect(wrapper.get('.resumo-aviso').text()).toContain('IAE, IRL')
  })

  it('imóvel: Interseções = camadas de alerta que ele cruza', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-A')
    expect(kpi('imoveis')).toBe('1')
    expect(kpi('intersecoes')).toBe('1')
    expect(wrapper.get('[data-kpi="intersecoes"]').text()).toContain('camada de alerta cruzada')
    expect(wrapper.get('[data-kpi="intersecoes"]').text()).not.toContain('camadas')
    expect(avisoDa('IAE').text()).toBe('Intersecta')
    expect(avisoDa('IRL').text()).toBe('Sem Reserva Legal declarada')
    expect(avisoDa('IAPP').text()).toBe('Possui')
  })

  it('imóvel sem sobreposição e com Reserva Legal não tem alerta', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-B')
    expect(kpi('intersecoes')).toBe('0')
    expect(wrapper.get('.resumo-aviso').text()).toBe('Sem interseção com camadas de alerta.')
    expect(wrapper.get('.resumo-aviso').classes()).toContain('resumo-aviso--sucesso')
  })

  it('indicador sem valor não vira alerta nem zero', async () => {
    await abrir()
    await selecionarImovel('PR-4106902-CTBA')
    expect(avisoDa('IAPP').text()).toBe('Indicador não calculado')
    expect(indicador('IAPP').text()).toContain('—')
    expect(indicador('IAPP').classes()).toContain('kpi-indicador--neutro')
  })

  it('situação de cada camada no mapa: publicada, vazia ou ainda sem camada', async () => {
    await abrir()
    expect(wrapper.get('[data-camada="IAE"] .camada-mapa').text()).toBe('124 feições publicadas')
    expect(wrapper.get('[data-camada="ISAP"] .camada-mapa').text()).toBe('Sem feições publicadas na Gold')
    expect(wrapper.get('[data-camada="IRL"] .camada-mapa').text()).toBe('Camada ainda não publicada no mapa')
    // Camada sem dado não pode ser ligada.
    expect(wrapper.get('[data-camada="ISAP"] input').attributes('disabled')).toBeDefined()
  })

  it('destaca no mapa só as camadas com dado, e mostra quantas feições cruzam', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-A')
    expect(buscarGeometriaDaSelecao).toHaveBeenCalledWith({ tipo: 'imovel', codigo: 'PR-4119905-A' })
    expect(buscarFeicoesQueCruzam).toHaveBeenCalledTimes(1)
    expect(buscarFeicoesQueCruzam).toHaveBeenCalledWith('datagis:vw_mapa_embargo', { tipo: 'imovel', codigo: 'PR-4119905-A' })
    expect(wrapper.get('[data-camada="IAE"] .camada-mapa').text()).toBe('2 feições destacadas no mapa')
  })

  it('com município em foco, o mapa desenha só os imóveis dele', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    const camadaImoveis = camadaWmsAutenticada.mock.results
      .map((r) => r.value)
      .find((c) => c.opcoes.layers === 'datagis:vw_mapa_imovel')
    expect(camadaImoveis.setParams).toHaveBeenLastCalledWith({ CQL_FILTER: 'MUNICIPIO_COD_IBGE=4119905' })
  })

  it('mapa preso ao Paraná: contorno da Gold, sem arrastar nem afastar pra fora', async () => {
    await abrir()
    expect(buscarContornoParana).toHaveBeenCalled()
    expect(mapaFalso.setMaxBounds).toHaveBeenCalled()
    expect(mapaFalso.setMinZoom).toHaveBeenCalledWith(7)
    // máscara: um polígono do mundo com o Paraná como furo
    const [aneis] = L.polygon.mock.calls[0]
    expect(aneis).toHaveLength(2)
    expect(aneis[1][0]).toEqual([-25, -50]) // [lat, lng]
  })

  it('sem o contorno publicado, avisa em vez de mostrar o mapa solto', async () => {
    buscarContornoParana.mockResolvedValue({ type: 'FeatureCollection', features: [] })
    await abrir()
    expect(wrapper.get('.alerta-erro').text()).toContain('Contorno do Paraná indisponível')
  })

  it('clique em município sem imóveis publicados avisa e não seleciona', async () => {
    identificarNoPonto.mockResolvedValue('4100103')
    await abrir()
    await mapaFalso._cliques[0]({ latlng: { lat: -24, lng: -50 } })
    await flushPromises()
    expect(wrapper.text()).toContain('ainda não tem imóveis com indicadores publicados')
    expect(kpi('municipios')).toBe('2')
  })

  it('clique em município com dado seleciona ele', async () => {
    identificarNoPonto.mockResolvedValue('4106902')
    await abrir()
    await mapaFalso._cliques[0]({ latlng: { lat: -25.4, lng: -49.3 } })
    await flushPromises()
    expect(wrapper.text()).toContain('KPIs de Curitiba')
  })

  it('limpar seleção volta pro recorte inteiro', async () => {
    await abrir()
    await selecionarMunicipio(4106902)
    await wrapper.get('.btn-secundario').trigger('click')
    await flushPromises()
    expect(kpi('imoveis')).toBe('3')
    expect(wrapper.text()).toContain('todo o recorte publicado')
  })
})

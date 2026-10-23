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
import { estadoTema } from '../tema'
import { temPermissao } from '../auth/autenticacao'

// Rota falsa: a query é editável por teste e o replace/push ficam registrados.
const rota = vi.hoisted(() => ({ query: {}, replace: null, push: null }))
vi.mock('vue-router', () => ({
  useRoute: () => rota,
  useRouter: () => ({ replace: rota.replace, push: rota.push }),
}))
vi.mock('../auth/autenticacao', () => ({ temPermissao: vi.fn(() => true) }))

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
    eventos: {},
    setParams: vi.fn(),
    on(evento, fn) {
      this.eventos[evento] = fn
      return this
    },
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
  // popup e tooltip: guardam o HTML pra o teste conferir o que o usuário veria
  const balao = () => ({
    setLatLng() { return this },
    setContent(html) { this.html = html; return this },
    openOn(m) { m._popup = this; return this },
  })
  const camada = () => ({
    setStyle: vi.fn(),
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
        _eventos: {},
        _popup: null,
        _etiqueta: null,
        options: {},
        setMaxBounds: vi.fn(),
        fitBounds: vi.fn(),
        setMinZoom: vi.fn(),
        getZoom: () => 7,
        on: vi.fn((evento, fn) => { mapaFalso._eventos[evento] = fn }),
        openTooltip: vi.fn((t) => { mapaFalso._etiqueta = t }),
        closeTooltip: vi.fn(() => { mapaFalso._etiqueta = null }),
        createPane: vi.fn(),
        getPane: () => ({ style: {} }),
        hasLayer: (l) => mapaFalso._camadas.has(l),
        removeLayer: vi.fn((l) => mapaFalso._camadas.delete(l)),
        remove: vi.fn(),
        closePopup: vi.fn(),
      })),
      control: { scale: vi.fn(() => ({ addTo: vi.fn() })) },
      tileLayer: vi.fn(camada),
      polygon: vi.fn(camada),
      geoJSON: vi.fn(camada),
      layerGroup: vi.fn(camada),
      circleMarker: vi.fn(camada),
      popup: vi.fn(balao),
      tooltip: vi.fn(balao),
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
  rota.query = {}
  rota.replace = vi.fn()
  rota.push = vi.fn()
  temPermissao.mockReturnValue(true)
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

function camadasWms() {
  return camadaWmsAutenticada.mock.results.map((r) => r.value)
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

  it('indicadores mostram só o valor, sem cor de faixa (tela visual)', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-A')
    for (const codigo of ['IAE', 'ICV', 'IRL']) expect(indicador(codigo).classes()).toEqual(['kpi-indicador'])
    expect(wrapper.find('.legenda-faixas').exists()).toBe(false)
    expect(wrapper.get('.kpis').text()).not.toMatch(/Bom|Crítico|Atenção|Não calculado/)
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
    expect(wrapper.findAll('.resumo-aviso .resumo-codigo').map((b) => b.text())).toEqual(['IAE', 'IRL'])
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

  it('OpenStreetMap fica num painel próprio, para o filtro do tema escuro não inverter as camadas do GeoServer', async () => {
    await abrir()
    expect(mapaFalso.createPane).toHaveBeenCalledWith('fundo')
    expect(L.tileLayer).toHaveBeenCalledWith(expect.stringContaining('openstreetmap'), expect.objectContaining({ pane: 'fundo' }))
    // as camadas do GeoServer não vão para o painel do fundo
    camadaWmsAutenticada.mock.calls.forEach(([, opcoes]) => expect(opcoes.pane).toBeUndefined())
  })

  it('trocar o tema com a tela aberta repinta a máscara e o contorno', async () => {
    estadoTema.atual = 'claro'
    await abrir()
    const mascara = L.polygon.mock.results[0].value
    const contorno = L.geoJSON.mock.results[0].value
    document.documentElement.style.setProperty('--cor-slate-100', '#1c2530')
    document.documentElement.style.setProperty('--cor-slate-900', '#f3f7fa')

    estadoTema.atual = 'escuro'
    await flushPromises()

    expect(mascara.setStyle).toHaveBeenLastCalledWith({ fillColor: '#1c2530' })
    expect(contorno.setStyle).toHaveBeenLastCalledWith({ color: '#f3f7fa' })
    document.documentElement.style.removeProperty('--cor-slate-100')
    document.documentElement.style.removeProperty('--cor-slate-900')
    estadoTema.atual = 'claro'
  })

  it('enquanto os indicadores carregam, mostra "—" e "Carregando…" em vez de zero e "não calculado"', async () => {
    let liberar
    listarIndicadoresPorImovel.mockReturnValue(new Promise((r) => { liberar = r }))
    await abrir()
    expect(kpi('imoveis')).toBe('—')
    expect(kpi('intersecoes')).toBe('—')
    expect(avisoDa('IAE').text()).toBe('Carregando…')

    liberar(IMOVEIS)
    await flushPromises()
    expect(kpi('imoveis')).toBe('3')
    expect(avisoDa('IAE').text()).not.toBe('Carregando…')
  })

  it('enquadra o Paraná sem animação, para o zoom mínimo ser o do estado inteiro', async () => {
    await abrir()
    expect(mapaFalso.fitBounds).toHaveBeenCalledWith(expect.anything(), { animate: false })
  })

  it('zoom fracionado, para o Paraná ocupar o mapa sem sobrar faixa vazia', async () => {
    await abrir()
    expect(L.map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ zoomSnap: 0.25 }))
  })

  it('destaca no mapa só os municípios com imóveis publicados', async () => {
    await abrir()
    const destaque = camadasWms().find((c) => c.opcoes.styles === 'vw_mapa_municipio_com_dados')
    expect(destaque.opcoes.layers).toBe('datagis:vw_mapa_municipio')
    expect(destaque.opcoes.CQL_FILTER).toBe("COD_NATURAL IN ('4106902','4119905')")
    expect(mapaFalso.hasLayer(destaque)).toBe(true)
    expect(wrapper.text()).toContain('Municípios com imóveis publicados')
  })

  it('preenchimento do destaque fica abaixo dos imóveis e o contorno acima deles', async () => {
    await abrir()
    const zIndex = (estilo) => camadasWms().find((c) => c.opcoes.styles === estilo).opcoes.zIndex
    const imoveis = camadasWms().find((c) => c.opcoes.layers === 'datagis:vw_mapa_imovel').opcoes.zIndex
    const embargo = camadasWms().find((c) => c.opcoes.layers === 'datagis:vw_mapa_embargo').opcoes.zIndex
    expect(zIndex('vw_mapa_municipio_com_dados')).toBeLessThan(imoveis)
    expect(zIndex('vw_mapa_municipio_com_dados_contorno')).toBeGreaterThan(imoveis)
    // as camadas de alerta continuam por cima do contorno
    expect(zIndex('vw_mapa_municipio_com_dados_contorno')).toBeLessThan(embargo)
  })

  it('o destaque dos municípios com dados pode ser desligado na legenda', async () => {
    await abrir()
    const preenchimento = camadasWms().find((c) => c.opcoes.styles === 'vw_mapa_municipio_com_dados')
    const contorno = camadasWms().find((c) => c.opcoes.styles === 'vw_mapa_municipio_com_dados_contorno')
    const caixa = wrapper.findAll('.camada-toggle').find((l) => l.text().includes('Municípios com imóveis publicados'))
    await caixa.get('input').setValue(false)
    await flushPromises()
    expect(mapaFalso.hasLayer(preenchimento)).toBe(false)
    expect(mapaFalso.hasLayer(contorno)).toBe(false)
  })

  it('mostra "Carregando mapa…" enquanto alguma camada carrega e some quando termina', async () => {
    await abrir()
    expect(wrapper.find('.mapa-carregando').exists()).toBe(false)
    const imoveis = camadasWms().find((c) => c.opcoes.layers === 'datagis:vw_mapa_imovel')

    imoveis.eventos.loading()
    await flushPromises()
    expect(wrapper.get('.mapa-carregando').text()).toContain('Carregando mapa')

    imoveis.eventos.load()
    await flushPromises()
    expect(wrapper.find('.mapa-carregando').exists()).toBe(false)
  })

  it('camada desligada no meio do carregamento não deixa o aviso preso', async () => {
    await abrir()
    const imoveis = camadasWms().find((c) => c.opcoes.layers === 'datagis:vw_mapa_imovel')
    imoveis.eventos.loading()
    await flushPromises()
    imoveis.eventos.remove()
    await flushPromises()
    expect(wrapper.find('.mapa-carregando').exists()).toBe(false)
  })

  it('sem o contorno publicado, avisa em vez de mostrar o mapa solto', async () => {
    buscarContornoParana.mockResolvedValue({ type: 'FeatureCollection', features: [] })
    await abrir()
    expect(wrapper.get('.alerta-erro').text()).toContain('Contorno do Paraná indisponível')
  })

  it('clique em município sem imóveis publicados avisa e não seleciona', async () => {
    identificarNoPonto.mockResolvedValue({ codigo: '4100103', rotulo: 'Almirante Tamandaré' })
    await abrir()
    await mapaFalso._eventos.click({ latlng: { lat: -24, lng: -50 } })
    await flushPromises()
    expect(wrapper.text()).toContain('ainda não tem imóveis com indicadores publicados')
    expect(kpi('municipios')).toBe('2')
  })

  it('clique em município com dado seleciona ele', async () => {
    identificarNoPonto.mockResolvedValue({ codigo: '4106902', rotulo: 'Curitiba' })
    await abrir()
    await mapaFalso._eventos.click({ latlng: { lat: -25.4, lng: -49.3 } })
    await flushPromises()
    expect(wrapper.text()).toContain('KPIs de Curitiba')
  })

  describe('informações no mapa', () => {
    const PONTO = { latlng: { lat: -25.1, lng: -50.1 } }

    it('clique em município com dados abre o balão com os números e os 7 indicadores', async () => {
      identificarNoPonto.mockResolvedValue({ codigo: '4119905', rotulo: 'Ponta Grossa' })
      await abrir()
      await mapaFalso._eventos.click(PONTO)
      await flushPromises()

      const html = mapaFalso._popup.html
      expect(html).toContain('Ponta Grossa')
      expect(html).toContain('2 imóveis')
      expect(html).toContain('1 imóvel com sobreposição')
      expect((html.match(/info-indicador"/g) || []).length).toBe(7)
      // só o valor, sem classe de faixa
      expect(html).toMatch(/info-indicador"><b>IAE<\/b>1,3/)
      expect(html).not.toContain('info-indicador--')
      expect(wrapper.text()).toContain('KPIs de Ponta Grossa')
    })

    it('clique em município sem dados mostra o nome dele e avisa, sem selecionar', async () => {
      identificarNoPonto.mockResolvedValue({ codigo: '4100103', rotulo: 'Almirante Tamandaré' })
      await abrir()
      await mapaFalso._eventos.click(PONTO)
      await flushPromises()

      expect(mapaFalso._popup.html).toContain('Almirante Tamandaré')
      expect(mapaFalso._popup.html).toContain('Ainda sem imóveis com indicadores publicados')
      expect(wrapper.text()).toContain('KPIs de todo o recorte publicado')
    })

    it('clique em imóvel abre o balão com município, área e os alertas que ele cruza', async () => {
      identificarNoPonto.mockResolvedValue({ codigo: 'PR-4119905-A', rotulo: 'PR-4119905-A' })
      await abrir()
      await wrapper.findAll('.chave')[1].trigger('click')
      await mapaFalso._eventos.click(PONTO)
      await flushPromises()

      const html = mapaFalso._popup.html
      expect(html).toContain('PR-4119905-A')
      expect(html).toContain('Ponta Grossa')
      expect(html).toContain('Área: 100,00 ha')
      expect(html).toContain('Cruza 1 camada de alerta: IAE')
      expect(identificarNoPonto).toHaveBeenCalledWith('datagis:vw_mapa_imovel', -50.1, -25.1)
    })

    it('nome vindo dos dados entra escapado no HTML do balão', async () => {
      identificarNoPonto.mockResolvedValue({ codigo: '9999999', rotulo: '<img src=x onerror=alert(1)>' })
      await abrir()
      await mapaFalso._eventos.click(PONTO)
      await flushPromises()

      expect(mapaFalso._popup.html).not.toContain('<img')
      expect(mapaFalso._popup.html).toContain('&lt;img')
    })

    describe('mouse parado', () => {
      beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
      afterEach(() => vi.useRealTimers())

      it('só consulta o GeoServer depois que o mouse para, e mostra a etiqueta curta', async () => {
        identificarNoPonto.mockResolvedValue({ codigo: '4119905', rotulo: 'Ponta Grossa' })
        await abrir()
        mapaFalso._eventos.mousemove(PONTO)
        mapaFalso._eventos.mousemove(PONTO)
        mapaFalso._eventos.mousemove(PONTO)
        expect(identificarNoPonto).not.toHaveBeenCalled()

        vi.advanceTimersByTime(400)
        await flushPromises()

        expect(identificarNoPonto).toHaveBeenCalledTimes(1)
        expect(mapaFalso._etiqueta.html).toContain('Ponta Grossa')
        expect(mapaFalso._etiqueta.html).toContain('1 imóvel com sobreposição')
        // etiqueta é curta: sem a grade de indicadores
        expect(mapaFalso._etiqueta.html).not.toContain('info-indicadores')
      })

      it('mexer o mouse de novo esconde a etiqueta', async () => {
        identificarNoPonto.mockResolvedValue({ codigo: '4119905', rotulo: 'Ponta Grossa' })
        await abrir()
        mapaFalso._eventos.mousemove(PONTO)
        vi.advanceTimersByTime(400)
        await flushPromises()
        expect(mapaFalso._etiqueta).not.toBeNull()

        mapaFalso._eventos.mousemove(PONTO)
        expect(mapaFalso._etiqueta).toBeNull()
      })

      it('resposta que chega depois de o mouse sair do mapa é descartada', async () => {
        let responder
        identificarNoPonto.mockReturnValue(new Promise((r) => { responder = r }))
        await abrir()
        mapaFalso._eventos.mousemove(PONTO)
        vi.advanceTimersByTime(400)
        mapaFalso._eventos.mouseout()

        responder({ codigo: '4119905', rotulo: 'Ponta Grossa' })
        await flushPromises()
        expect(mapaFalso._etiqueta).toBeNull()
      })
    })
  })

  it('limpar seleção volta pro recorte inteiro', async () => {
    await abrir()
    await selecionarMunicipio(4106902)
    await wrapper.get('[data-acao="limpar"]').trigger('click')
    await flushPromises()
    expect(kpi('imoveis')).toBe('3')
    expect(wrapper.text()).toContain('todo o recorte publicado')
  })
})

describe('ConjuntosView — atalhos e ajudas da tela', () => {
  // Mais imóveis em Ponta Grossa para a lista: C cruza 2 camadas, D cruza 1 com mais área.
  const COM_LISTA = [
    ...IMOVEIS,
    { codImovel: 'PR-4119905-C', municipioCodIbge: 4119905, municipioNome: 'Ponta Grossa', areaHa: 10, valorIcv: 0, valorIrl: 0, valorIapp: 0, valorIsap: 2, valorIae: 1, valorIdesmat: 0, valorIfc: 0 },
    { codImovel: 'PR-4119905-D', municipioCodIbge: 4119905, municipioNome: 'Ponta Grossa', areaHa: 10, valorIcv: 0, valorIrl: 0, valorIapp: 0, valorIsap: 0, valorIae: 0, valorIdesmat: 30, valorIfc: 0 },
  ]

  it('lista os imóveis com alerta do município, quem cruza mais camadas primeiro', async () => {
    listarIndicadoresPorImovel.mockResolvedValue(COM_LISTA)
    await abrir()
    expect(wrapper.find('.lista-alerta').exists()).toBe(false)
    await selecionarMunicipio(4119905)
    const itens = wrapper.findAll('.lista-alerta-item')
    // B não cruza nada e fica de fora; C (2 camadas), D (IDESMAT 30%), A (IAE 5%)
    expect(itens.map((i) => i.attributes('title').split(' ')[0])).toEqual(['PR-4119905-C', 'PR-4119905-D', 'PR-4119905-A'])
    expect(itens[0].text()).toContain('ISAP 2,0%')
    expect(itens[0].text()).toContain('IAE 1,0%')
    expect(wrapper.get('[data-lista="sobreposicao"]').text()).toBe('Sobreposição (3)')
  })

  it('clicar num imóvel da lista passa para a visão de imóvel nele', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    await wrapper.get('.lista-alerta-item').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.chave')[1].classes()).toContain('chave--ativa')
    expect(wrapper.get('#input-imovel').element.value).toBe('PR-4119905-A')
    expect(kpi('intersecoes')).toBe('1')
  })

  it('lista longa mostra 8 e o botão abre o resto', async () => {
    const muitos = Array.from({ length: 10 }, (_, n) => ({
      codImovel: `PR-4119905-X${n}`, municipioCodIbge: 4119905, municipioNome: 'Ponta Grossa', areaHa: 1, valorIae: n + 1,
    }))
    listarIndicadoresPorImovel.mockResolvedValue(muitos)
    await abrir()
    await selecionarMunicipio(4119905)
    expect(wrapper.findAll('.lista-alerta-item')).toHaveLength(8)
    await wrapper.get('.lista-alerta-mais').trigger('click')
    expect(wrapper.findAll('.lista-alerta-item')).toHaveLength(10)
  })

  it('grava a seleção na URL e limpa ao tirar a seleção', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    expect(rota.replace).toHaveBeenLastCalledWith({ query: { municipio: '4119905' } })
    rota.query = { municipio: '4119905' }
    await wrapper.get('[data-acao="limpar"]').trigger('click')
    await flushPromises()
    expect(rota.replace).toHaveBeenLastCalledWith({ query: {} })
  })

  it('abre já no município ou no imóvel que está na URL', async () => {
    rota.query = { municipio: '4119905' }
    await abrir()
    expect(wrapper.get('#select-municipio').element.value).toBe('4119905')
    expect(kpi('imoveis')).toBe('2')
    wrapper.unmount()

    rota.query = { imovel: 'PR-4119905-A' }
    await abrir()
    expect(wrapper.findAll('.chave')[1].classes()).toContain('chave--ativa')
    expect(wrapper.get('#input-imovel').element.value).toBe('PR-4119905-A')
  })

  it('código desconhecido na URL é ignorado', async () => {
    rota.query = { municipio: '9999999' }
    await abrir()
    expect(wrapper.get('#select-municipio').element.value).toBe('')
    expect(kpi('municipios')).toBe('2')
  })

  it('botão "Ver em tabela" abre a tabela no item selecionado', async () => {
    await abrir()
    expect(wrapper.get('h1').text()).toBe('Indicadores e Resultados')
    expect(wrapper.get('[data-acao="indicadores"]').text()).toBe('Ver em tabela')
    await selecionarMunicipio(4119905)
    await wrapper.get('[data-acao="indicadores"]').trigger('click')
    expect(rota.push).toHaveBeenLastCalledWith({ path: '/indicadores', query: { municipio: '4119905' } })

    await selecionarImovel('PR-4119905-A')
    await wrapper.get('[data-acao="indicadores"]').trigger('click')
    expect(rota.push).toHaveBeenLastCalledWith({ path: '/indicadores', query: { visao: 'imovel', imovel: 'PR-4119905-A' } })
  })

  it('sem permissão de indicador, o atalho para a tabela não aparece', async () => {
    temPermissao.mockReturnValue(false)
    await abrir()
    expect(wrapper.find('[data-acao="indicadores"]').exists()).toBe(false)
  })

  it('botão "ver o Paraná inteiro" reenquadra o estado sem perder a seleção', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    mapaFalso.fitBounds.mockClear()
    await wrapper.get('.mapa-inicio').trigger('click')
    expect(mapaFalso.fitBounds).toHaveBeenCalledWith(limites)
    expect(mapaFalso.closePopup).toHaveBeenCalled()
    expect(wrapper.get('#select-municipio').element.value).toBe('4119905')
  })

  it('mostra a régua de escala em metros', async () => {
    await abrir()
    expect(L.control.scale).toHaveBeenCalledWith({ imperial: false, position: 'bottomleft' })
  })

  it('dica do KPI mostra só o que a sigla significa, sem faixa nem classificação', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    const dica = indicador('IAE').get('.dica-indicador')
    expect(dica.attributes('role')).toBe('tooltip')
    expect(dica.text()).toContain('IAE')
    expect(dica.text()).not.toMatch(/melhor|Bom|Atenção|Crítico/)
  })
})

describe('ConjuntosView — chegar no motivo do alerta', () => {
  it('clicar no código do aviso destaca o item da camada no painel (imóvel)', async () => {
    await abrir()
    await selecionarImovel('PR-4119905-A')
    expect(wrapper.find('[data-camada="IRL"]').classes()).not.toContain('item-camada--foco')
    await wrapper.get('[data-ir-para="IRL"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-camada="IRL"]').classes()).toContain('item-camada--foco')
    expect(wrapper.get('[data-camada="IRL"]').text()).toContain('Sem Reserva Legal declarada')
  })

  it('município: aba "Sem Reserva Legal" lista os imóveis com IRL zero e o código do aviso abre ela', async () => {
    await abrir()
    await selecionarMunicipio(4119905)
    expect(wrapper.get('[data-lista="reservaLegal"]').text()).toBe('Sem Reserva Legal (1)')
    expect(wrapper.get('[data-lista="sobreposicao"]').attributes('aria-selected')).toBe('true')

    await wrapper.get('[data-ir-para="IRL"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-lista="reservaLegal"]').attributes('aria-selected')).toBe('true')
    const itens = wrapper.findAll('.lista-alerta-item')
    expect(itens).toHaveLength(1)
    expect(itens[0].text()).toContain('IRL 0,0%')

    await itens[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('#input-imovel').element.value).toBe('PR-4119905-A')
  })

  it('município só com alerta de Reserva Legal: a lista abre direto nessa aba', async () => {
    await abrir()
    // Curitiba (IRL 22) não tem nenhum; troca o imóvel dela para IRL zero
    listarIndicadoresPorImovel.mockResolvedValue([{ ...IMOVEIS[0], valorIrl: 0 }, ...IMOVEIS.slice(1)])
    wrapper.unmount()
    await abrir()
    await selecionarMunicipio(4106902)
    expect(wrapper.get('[data-lista="sobreposicao"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-lista="reservaLegal"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.lista-alerta-item')).toHaveLength(1)
  })
})


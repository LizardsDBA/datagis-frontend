import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import L from 'leaflet'
import { apiFetch } from '../services/http'
import { PAINEL_WMS, camadaWmsAutenticada, limparCacheWms } from './camadaWmsAutenticada'

vi.mock('../services/http', () => ({ apiFetch: vi.fn() }))

const URL_WMS = '/api/indicadores/geoserver/wms'

function respostaImagem(tipo = 'image/png', status = 200) {
  return {
    ok: status === 200,
    status,
    headers: { get: () => tipo },
    blob: async () => new Blob(['png'], { type: tipo }),
  }
}

/** Parâmetros do GetMap pedido (nomes em maiúsculas, como o Leaflet monta). */
function parametrosDoPedido(chamada = 0) {
  return new URL(apiFetch.mock.calls[chamada][0], 'http://localhost').searchParams
}

/** O navegador dispararia o onload ao decodificar o blob; no jsdom é na mão. */
function carregarImagens() {
  mapa.getPane(PAINEL_WMS)?.querySelectorAll('img').forEach((img) => img.onload?.())
}

let mapa
let contador
beforeEach(() => {
  apiFetch.mockReset()
  limparCacheWms()
  contador = 0
  URL.createObjectURL = vi.fn(() => `blob:imagem-${++contador}`)
  URL.revokeObjectURL = vi.fn()
  const div = document.createElement('div')
  document.body.appendChild(div)
  mapa = L.map(div, { zoomAnimation: false, fadeAnimation: false }).setView([-24.6, -51.4], 7)
  // jsdom não tem layout: o tamanho do mapa é fixado aqui
  mapa.getSize = () => L.point(800, 600)
})
afterEach(() => {
  mapa.remove()
  vi.restoreAllMocks()
})

describe('camadaWmsAutenticada', () => {
  it('pede uma imagem só, do tamanho do mapa com folga, pelo apiFetch (com token)', async () => {
    apiFetch.mockResolvedValue(respostaImagem())
    const eventos = []
    const camada = camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_imovel', format: 'image/png8', zIndex: 10 })
    camada.on('loading', () => eventos.push('loading')).on('load', () => eventos.push('load'))

    camada.addTo(mapa)
    await flushPromises()
    carregarImagens()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const params = parametrosDoPedido()
    expect(apiFetch.mock.calls[0][0]).toMatch(/^\/api\/indicadores\/geoserver\/wms\?/)
    expect(params.get('REQUEST')).toBe('GetMap')
    expect(params.get('LAYERS')).toBe('datagis:vw_mapa_imovel')
    expect(params.get('FORMAT')).toBe('image/png8')
    expect(params.get('SRS')).toBe('EPSG:3857')
    // 800x600 com 25% de folga de cada lado
    expect(params.get('WIDTH')).toBe('1200')
    expect(params.get('HEIGHT')).toBe('900')
    expect(params.get('BBOX').split(',')).toHaveLength(4)
    // zIndex é opção do Leaflet, não vai pro GeoServer
    expect(params.has('ZINDEX')).toBe(false)

    const imagens = mapa.getPane(PAINEL_WMS).querySelectorAll('img')
    expect(imagens).toHaveLength(1)
    expect(imagens[0].src).toBe('blob:imagem-1')
    expect(imagens[0].style.zIndex).toBe('10')
    expect(eventos).toEqual(['loading', 'load'])
  })

  it('o painel das imagens fica acima do mapa de fundo e abaixo da máscara', async () => {
    apiFetch.mockResolvedValue(respostaImagem())
    camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_municipio' }).addTo(mapa)
    await flushPromises()

    const z = Number(mapa.getPane(PAINEL_WMS).style.zIndex)
    expect(z).toBeGreaterThan(200)
    expect(z).toBeLessThan(350)
  })

  it('a mesma vista de novo usa a imagem guardada, sem pedir ao GeoServer', async () => {
    apiFetch.mockResolvedValue(respostaImagem())
    const camada = camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_municipio' })
    camada.addTo(mapa)
    await flushPromises()
    carregarImagens()

    mapa.removeLayer(camada)
    camada.addTo(mapa)
    await flushPromises()
    carregarImagens()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(mapa.getPane(PAINEL_WMS).querySelectorAll('img')).toHaveLength(1)
  })

  it('mexer no mapa pede a imagem da vista nova e tira a antiga só quando a nova carrega', async () => {
    apiFetch.mockResolvedValue(respostaImagem())
    camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_municipio' }).addTo(mapa)
    await flushPromises()
    carregarImagens()

    mapa.setView([-25.4, -49.3], 9)
    await flushPromises()
    expect(apiFetch).toHaveBeenCalledTimes(2)
    // a nova ainda não carregou: as duas estão lá, a antiga embaixo
    expect(mapa.getPane(PAINEL_WMS).querySelectorAll('img')).toHaveLength(2)

    carregarImagens()
    const imagens = mapa.getPane(PAINEL_WMS).querySelectorAll('img')
    expect(imagens).toHaveLength(1)
    expect(imagens[0].src).toBe('blob:imagem-2')
  })

  it('setParams pede de novo com o filtro novo', async () => {
    apiFetch.mockResolvedValue(respostaImagem())
    const camada = camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_imovel' }).addTo(mapa)
    await flushPromises()

    camada.setParams({ CQL_FILTER: 'MUNICIPIO_COD_IBGE=4119905' })
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(parametrosDoPedido(1).get('CQL_FILTER')).toBe('MUNICIPIO_COD_IBGE=4119905')
  })

  it('camada desligada antes de a imagem chegar não deixa imagem no mapa', async () => {
    let responder
    apiFetch.mockReturnValue(new Promise((r) => { responder = r }))
    const camada = camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_municipio' }).addTo(mapa)
    await flushPromises()

    mapa.removeLayer(camada)
    responder(respostaImagem())
    await flushPromises()
    carregarImagens()

    expect(mapa.getPane(PAINEL_WMS).querySelectorAll('img')).toHaveLength(0)
  })

  it('erro do GeoServer em XML com HTTP 200 não vira imagem, e o carregamento termina', async () => {
    apiFetch.mockResolvedValue(respostaImagem('application/vnd.ogc.se_xml'))
    const erros = []
    const cargas = []
    camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_imovel' })
      .on('tileerror', (e) => erros.push(e.error))
      .on('load', () => cargas.push(true))
      .addTo(mapa)
    await flushPromises()

    expect(erros[0]).toBeInstanceOf(Error)
    expect(cargas).toHaveLength(1)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(mapa.getPane(PAINEL_WMS).querySelectorAll('img')).toHaveLength(0)
  })

  it('403 do proxy vira erro da camada', async () => {
    apiFetch.mockResolvedValue(respostaImagem('application/json', 403))
    const erros = []
    camadaWmsAutenticada(URL_WMS, { layers: 'datagis:vw_mapa_imovel' })
      .on('tileerror', (e) => erros.push(e.error))
      .addTo(mapa)
    await flushPromises()

    expect(erros[0].message).toContain('403')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../services/http'
import { camadaWmsAutenticada } from './camadaWmsAutenticada'

vi.mock('../services/http', () => ({ apiFetch: vi.fn() }))

function respostaImagem(tipo = 'image/png', status = 200) {
  return {
    ok: status === 200,
    status,
    headers: { get: () => tipo },
    blob: async () => new Blob(['png'], { type: tipo }),
  }
}

/** createTile é assíncrono: espera o "done" do Leaflet. */
function criarTile(camada) {
  return new Promise((resolve) => {
    const tile = camada.createTile({ x: 1, y: 2, z: 7 }, (erro, img) => resolve({ erro, img, tile }))
    // dispara o onload que o navegador dispararia ao decodificar o blob
    setTimeout(() => tile.onload?.(), 0)
  })
}

let camada
beforeEach(() => {
  apiFetch.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:tile-1')
  URL.revokeObjectURL = vi.fn()
  camada = camadaWmsAutenticada('/api/indicadores/geoserver/wms', { layers: 'datagis:vw_mapa_imovel' })
  // getTileUrl precisa do mapa; aqui basta uma URL fixa
  camada.getTileUrl = () => '/api/indicadores/geoserver/wms?REQUEST=GetMap&LAYERS=datagis:vw_mapa_imovel'
})
afterEach(() => vi.restoreAllMocks())

describe('camadaWmsAutenticada', () => {
  it('baixa o tile pelo apiFetch (com token) e põe o blob no <img>', async () => {
    apiFetch.mockResolvedValue(respostaImagem())

    const { erro, img } = await criarTile(camada)

    expect(apiFetch).toHaveBeenCalledWith('/api/indicadores/geoserver/wms?REQUEST=GetMap&LAYERS=datagis:vw_mapa_imovel')
    expect(erro).toBeNull()
    expect(img.src).toContain('blob:tile-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tile-1')
  })

  it('erro do GeoServer em XML com HTTP 200 não vira imagem', async () => {
    apiFetch.mockResolvedValue(respostaImagem('application/vnd.ogc.se_xml'))

    const { erro } = await criarTile(camada)

    expect(erro).toBeInstanceOf(Error)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('403 do proxy vira erro do tile', async () => {
    apiFetch.mockResolvedValue(respostaImagem('application/json', 403))

    const { erro } = await criarTile(camada)

    expect(erro.message).toContain('403')
  })
})

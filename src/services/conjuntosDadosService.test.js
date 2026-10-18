import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarComparacaoCamadas } from './conjuntosDadosService'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

describe('buscarComparacaoCamadas', () => {
  it('consulta o par de camadas pedido e devolve o diff', async () => {
    const diff = { destinoEncontrado: true, campos: [] }
    fetch.mockResolvedValue({ ok: true, json: async () => diff })

    await expect(buscarComparacaoCamadas(10, 'BRONZE', 'SILVER')).resolves.toEqual(diff)

    expect(fetch).toHaveBeenCalledWith(
      '/api/conjuntos-dados/registros/10/comparacao?origem=BRONZE&destino=SILVER',
    )
  })

  it('usa a mensagem de erro do backend quando ela vem no corpo', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ erro: 'Comparação BRONZE → GOLD não suportada' }) })

    await expect(buscarComparacaoCamadas(10, 'BRONZE', 'GOLD')).rejects.toThrow('não suportada')
  })

  it('cai numa mensagem padrão quando o erro não tem corpo', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('sem corpo') } })

    await expect(buscarComparacaoCamadas(10, 'SILVER', 'GOLD')).rejects.toThrow(
      'Falha ao comparar o registro 10 entre SILVER e GOLD',
    )
  })
})

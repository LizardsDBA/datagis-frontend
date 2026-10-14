import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  },
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => api),
  },
}))

async function carregarGoldService() {
  return await import('./goldService')
}

beforeEach(() => {
  api.get.mockReset()
  api.post.mockReset()
  api.put.mockReset()
  api.delete.mockReset()
})

describe('goldService', () => {
  it('configura Axios com baseURL /api', async () => {
    vi.resetModules()

    const axiosModule = await import('axios')
    axiosModule.default.create.mockClear()

    await import('./goldService')

    expect(axiosModule.default.create).toHaveBeenCalledWith({
      baseURL: '/api',
    })
  })

  it('lista tipos de indicador pela rota correta', async () => {
    const { listarTiposIndicador } = await carregarGoldService()

    const dados = [{ id: 1, codigo: 'ISAP' }]
    api.get.mockResolvedValueOnce({ data: dados })

    await expect(listarTiposIndicador()).resolves.toEqual(dados)
    expect(api.get).toHaveBeenCalledWith('/indicadores/tipos')
  })

  it('consulta um tipo de indicador por id', async () => {
    const { buscarTipoIndicadorPorId } = await carregarGoldService()

    const dados = { id: 1, codigo: 'ISAP' }
    api.get.mockResolvedValueOnce({ data: dados })

    await expect(buscarTipoIndicadorPorId(1)).resolves.toEqual(dados)
    expect(api.get).toHaveBeenCalledWith('/indicadores/tipos/1')
  })

  it('cadastra tipo de indicador enviando o payload', async () => {
    const { cadastrarTipoIndicador } = await carregarGoldService()

    const payload = {
      codigo: 'novo',
      descricao: 'Novo indicador',
      temFonte: true,
      ativo: true,
    }

    const resposta = {
      id: 9,
      codigo: 'NOVO',
      descricao: 'Novo indicador',
      temFonte: true,
      ativo: true,
    }

    api.post.mockResolvedValueOnce({ data: resposta })

    await expect(cadastrarTipoIndicador(payload)).resolves.toEqual(resposta)

    expect(api.post).toHaveBeenCalledWith(
      '/indicadores/tipos',
      payload,
    )
  })

  it('atualiza tipo de indicador pela rota do id', async () => {
    const { atualizarTipoIndicador } = await carregarGoldService()

    const payload = {
      codigo: 'ISAP',
      descricao: 'Atualizado',
      temFonte: true,
      ativo: true,
    }

    const resposta = {
      id: 1,
      ...payload,
    }

    api.put.mockResolvedValueOnce({ data: resposta })

    await expect(atualizarTipoIndicador(1, payload)).resolves.toEqual(
      resposta,
    )

    expect(api.put).toHaveBeenCalledWith(
      '/indicadores/tipos/1',
      payload,
    )
  })

  it('desativa o tipo de indicador sem tentar ler corpo do 204', async () => {
    const { desativarTipoIndicador } = await carregarGoldService()

    api.delete.mockResolvedValueOnce({ status: 204 })

    await expect(desativarTipoIndicador(1)).resolves.toBeUndefined()

    expect(api.delete).toHaveBeenCalledWith(
      '/indicadores/tipos/1',
    )
  })

  it('lista imóveis publicados', async () => {
    const { listarImoveisPublicados } = await carregarGoldService()

    const dados = [{ codImovel: 'PR-DEMO-001' }]
    api.get.mockResolvedValueOnce({ data: dados })

    await expect(listarImoveisPublicados()).resolves.toEqual(dados)

    expect(api.get).toHaveBeenCalledWith('/gold/imoveis')
  })

  it('consulta imóvel publicado pelo código', async () => {
    const { buscarImovelPublicado } = await carregarGoldService()

    const dados = {
      codImovel: 'PR-DEMO-001',
      valorIsap: 0.18,
    }

    api.get.mockResolvedValueOnce({ data: dados })

    await expect(
      buscarImovelPublicado('PR-DEMO-001'),
    ).resolves.toEqual(dados)

    expect(api.get).toHaveBeenCalledWith(
      '/gold/imoveis/PR-DEMO-001',
    )
  })

  it('escapa caracteres especiais no código do imóvel', async () => {
    const { buscarImovelPublicado } = await carregarGoldService()

    api.get.mockResolvedValueOnce({
      data: {
        codImovel: 'PR/DEMO 001',
      },
    })

    await buscarImovelPublicado('PR/DEMO 001')

    expect(api.get).toHaveBeenCalledWith(
      '/gold/imoveis/PR%2FDEMO%20001',
    )
  })

  it('preserva a mensagem erro do backend', async () => {
    const { cadastrarTipoIndicador } = await carregarGoldService()

    api.post.mockRejectedValueOnce({
      response: {
        data: {
          erro: 'Já existe um tipo de indicador com o código ISAP',
        },
      },
    })

    await expect(cadastrarTipoIndicador({})).rejects.toThrow(
      'Já existe um tipo de indicador com o código ISAP',
    )
  })

  it('usa a mensagem genérica quando o backend não envia detalhe', async () => {
    const { listarImoveisPublicados } = await carregarGoldService()

    api.get.mockRejectedValueOnce({
      response: {
        data: {},
      },
    })

    await expect(listarImoveisPublicados()).rejects.toThrow(
      'Falha ao carregar os imóveis publicados.',
    )
  })
})
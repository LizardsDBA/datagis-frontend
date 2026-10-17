import { beforeEach, describe, expect, it, vi } from 'vitest'

const { api } = vi.hoisted(() => ({
    api: {
        get: vi.fn(),
        interceptors: { request: { use: vi.fn() } },
    },
}))

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => api),
    },
}))

beforeEach(() => {
    api.get.mockReset()
})

describe('consultaIndicadoresService', () => {
    it('configura Axios com baseURL /api', async () => {
        const axiosModule = await import('axios')

        await import('./consultaIndicadoresService')

        expect(axiosModule.default.create).toHaveBeenCalledWith({ baseURL: '/api' })
    })

    it('busca os indicadores por município na rota correta', async () => {
        const { listarIndicadoresPorMunicipio } = await import('./consultaIndicadoresService')
        api.get.mockResolvedValue({ data: [{ codIbge: 4106902, nome: 'Curitiba' }] })

        const resultado = await listarIndicadoresPorMunicipio()

        expect(api.get).toHaveBeenCalledWith('/indicadores/municipios')
        expect(resultado).toEqual([{ codIbge: 4106902, nome: 'Curitiba' }])
    })

    it('busca os indicadores por imóvel na rota correta', async () => {
        const { listarIndicadoresPorImovel } = await import('./consultaIndicadoresService')
        api.get.mockResolvedValue({ data: [{ codImovel: 'PR-4106902-ABC' }] })

        const resultado = await listarIndicadoresPorImovel()

        expect(api.get).toHaveBeenCalledWith('/indicadores/imoveis')
        expect(resultado).toEqual([{ codImovel: 'PR-4106902-ABC' }])
    })

    it('propaga a mensagem de erro que o backend devolveu', async () => {
        const { listarIndicadoresPorMunicipio } = await import('./consultaIndicadoresService')
        api.get.mockRejectedValue({ response: { data: { erro: 'Acesso negado' } } })

        await expect(listarIndicadoresPorMunicipio()).rejects.toThrow('Acesso negado')
    })

    it('usa mensagem padrão quando o backend não devolve detalhe', async () => {
        const { listarIndicadoresPorImovel } = await import('./consultaIndicadoresService')
        api.get.mockRejectedValue({})

        await expect(listarIndicadoresPorImovel()).rejects.toThrow(
            'Falha ao carregar os indicadores por imóvel.',
        )
    })
})
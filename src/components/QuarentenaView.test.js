import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import QuarentenaView from './QuarentenaView.vue'
import {
    buscarItensQuarentena,
    buscarMetricasQuarentena,
    buscarStatusAnalise,
    buscarTiposErro,
} from '../services/quarentenaService'

// O filtro de lote chega pela URL (?loteId=); cada teste define a query antes de montar a tela.
let queryAtual = {}
vi.mock('vue-router', () => ({
    useRoute: () => ({ query: queryAtual }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('../services/quarentenaService', () => ({
    buscarItensQuarentena: vi.fn(),
    buscarMetricasQuarentena: vi.fn(),
    buscarTiposErro: vi.fn(),
    buscarStatusAnalise: vi.fn(),
}))

// Um registro retido qualquer, só com os campos que a tabela lê.
const ITEM_RETIDO = {
    id: 10,
    entidade: 'imovel_rural',
    chaveIdentificacao: 'PR-4106902-ABC',
    tipoErroCodigo: 'GEOMETRIA_INVALIDA',
    campoProblema: 'geometria',
    motivoRejeicao: 'Auto-intersecao no poligono',
    statusAnaliseCodigo: 'PENDENTE',
    statusAnaliseDescricao: 'Aguardando analise do operador',
    fonteDadoId: 1,
    fonteDadoNome: 'CAR - Imoveis (PR)',
    loteIngestaoId: 3,
}

let wrapper

beforeEach(() => {
    vi.clearAllMocks()
    queryAtual = {}
    buscarMetricasQuarentena.mockResolvedValue({
        totalRegistros: 0, totalPendentes: 0, totalEmAnalise: 0, totalCorrigidos: 0, totalDescartados: 0,
    })
    buscarTiposErro.mockResolvedValue([])
    buscarStatusAnalise.mockResolvedValue([])
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

async function abrirTela({ loteId, itens }) {
    if (loteId) queryAtual = { loteId }
    buscarItensQuarentena.mockResolvedValue({ itens, totalCount: itens.length })
    wrapper = mount(QuarentenaView, {
        // O gráfico de diagnóstico e o modal de detalhe não fazem parte do que está sendo testado aqui.
        global: { stubs: { DiagnosticoChart: true, DetalheQuarentenaModal: true } },
    })
    await flushPromises()
}

describe('QuarentenaView — aviso do filtro de lote', () => {
    it('com a lista vazia, mostra só uma faixa neutra, sem falar em inconsistência', async () => {
        await abrirTela({ loteId: '3', itens: [] })

        const banner = wrapper.get('.banner-filtro-lote')
        expect(banner.classes()).toContain('banner-filtro-lote--neutro')
        expect(banner.text()).toContain('Mostrando apenas o Lote #3')
        expect(banner.text()).not.toContain('problemas encontrados')
        expect(banner.text()).not.toContain('Silver')
    })

    it('com registros na lista, mostra o aviso de que o lote não vai para a Silver', async () => {
        await abrirTela({ loteId: '3', itens: [ITEM_RETIDO] })

        const banner = wrapper.get('.banner-filtro-lote')
        expect(banner.classes()).not.toContain('banner-filtro-lote--neutro')
        expect(banner.text()).toContain('problemas encontrados no Lote #3')
        expect(banner.text()).toContain('nenhum registro do lote vai para a Silver')
    })

    it('sem filtro de lote, nenhum aviso de lote aparece', async () => {
        await abrirTela({ itens: [ITEM_RETIDO] })

        expect(wrapper.find('.banner-filtro-lote').exists()).toBe(false)
    })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DiagnosticoChart from './DiagnosticoChart.vue'
import { buscarDiagnostico } from '../services/quarentenaService'

vi.mock('../services/quarentenaService', () => ({
    buscarDiagnostico: vi.fn()
}))

describe('DiagnosticoChart.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deve exibir mensagem de estado vazio quando não há registros na Quarentena', async () => {
        buscarDiagnostico.mockResolvedValue([])

        const wrapper = mount(DiagnosticoChart)
        await flushPromises()

        expect(wrapper.text()).toContain('Nenhuma inconsistência retida')
    })

    it('deve renderizar a tabela analítica e calcular o percentual corretamente', async () => {
        const mockDados = [
            { tipoErro: 'CAMPO_OBRIGATORIO_AUSENTE', quantidade: 80 },
            { tipoErro: 'TIPO_DE_DADO_INVALIDO', quantidade: 20 }
        ]
        buscarDiagnostico.mockResolvedValue(mockDados)

        const wrapper = mount(DiagnosticoChart)
        wrapper.vm.expandido = true
        await flushPromises()

        expect(wrapper.text()).toContain('Campo Obrigatório Ausente')
        expect(wrapper.text()).toContain('Tipo de Dado Inválido')
        expect(wrapper.text()).toContain('80.00%')
        expect(wrapper.text()).toContain('20.00%')
    })
})
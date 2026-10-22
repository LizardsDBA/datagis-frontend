import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PainelMonitoramentoGlobal from './PainelMonitoramentoGlobal.vue'
import { obterStatusGlobal } from '../services/monitoramentoService'
import { useMonitoramentoGlobal } from '../composables/useMonitoramentoGlobal'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../services/monitoramentoService', () => ({
  obterStatusGlobal: vi.fn(),
}))

describe('PainelMonitoramentoGlobal.vue', () => {
  let wrapper

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    const { fecharPainel, definirAba } = useMonitoramentoGlobal()
    fecharPainel()
    definirAba('TODAS')
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('exibe pílula minimizada inicialmente quando o painel estiver fechado', async () => {
    obterStatusGlobal.mockResolvedValue({
      totalEmAndamento: 0,
      ingestoes: [],
      migracoesSilver: [],
      migracaoGold: null,
    })

    wrapper = mount(PainelMonitoramentoGlobal)
    await flushPromises()

    const pill = wrapper.find('.pill-minimizada')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('Processamentos')
  })

  it('ao clicar na pílula minimizada, expande o card com as tarefas e abas', async () => {
    obterStatusGlobal.mockResolvedValue({
      totalEmAndamento: 2,
      ingestoes: [
        {
          fonteId: 10,
          fonteNome: 'CAR Paraná',
          fase: 'LENDO_REGISTROS',
          registrosProcessados: 1200,
          totalEstimado: 2400,
          percentual: 50,
          detalhe: 'Lendo blocos',
          emExecucao: true,
        },
      ],
      migracoesSilver: [
        {
          loteId: 42,
          fonteNome: 'CAR Paraná',
          fase: 'VALIDANDO_REGRAS',
          registrosProcessados: 600,
          totalRegistros: 1000,
          percentual: 60,
          errosEncontrados: 2,
          detalhe: 'Validando geometrias',
          statusFinal: 'EM_PROCESSAMENTO',
          emExecucao: true,
        },
      ],
      migracaoGold: {
        emExecucao: true,
        percentualGeral: 40,
        statusIndicadores: 'EM_ANDAMENTO',
        indicadoresProcessados: 400,
        indicadoresTotal: 1000,
        camadasMapa: [
          { codigoCamada: 'IMOVEL_RURAL', status: 'CONCLUIDA' },
          { codigoCamada: 'MUNICIPIO', status: 'EM_ANDAMENTO' },
        ],
      },
    })

    wrapper = mount(PainelMonitoramentoGlobal)
    await flushPromises()

    // Clica na pílula para expandir
    await wrapper.find('.pill-minimizada').trigger('click')
    await flushPromises()

    expect(wrapper.find('.painel-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('Processamentos Ativos')
    expect(wrapper.text()).toContain('CAR Paraná')
    expect(wrapper.text()).toContain('Lote #42')
    expect(wrapper.text()).toContain('Publicação Consolidada na Gold')
  })

  it('permite filtrar por abas Ingestão, Silver e Gold', async () => {
    obterStatusGlobal.mockResolvedValue({
      totalEmAndamento: 2,
      ingestoes: [
        { fonteId: 10, fonteNome: 'CAR Ingestão', fase: 'LENDO_REGISTROS', registrosProcessados: 50, percentual: 50, emExecucao: true },
      ],
      migracoesSilver: [
        { loteId: 42, fonteNome: 'Lote Silver', fase: 'VALIDANDO_REGRAS', percentual: 60, totalRegistros: 100, registrosProcessados: 60, errosEncontrados: 0, emExecucao: true },
      ],
      migracaoGold: null,
    })

    const { abrirPainel } = useMonitoramentoGlobal()
    abrirPainel()

    wrapper = mount(PainelMonitoramentoGlobal)
    await flushPromises()

    // Filtra pela aba Ingestão
    const btnAbaIngestao = wrapper.findAll('.aba-btn').find(b => b.text().includes('Ingestão'))
    expect(btnAbaIngestao).toBeDefined()
    await btnAbaIngestao.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('CAR Ingestão')
    expect(wrapper.text()).not.toContain('Lote Silver')

    // Filtra pela aba Silver
    const btnAbaSilver = wrapper.findAll('.aba-btn').find(b => b.text().includes('Silver'))
    await btnAbaSilver.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('CAR Ingestão')
    expect(wrapper.text()).toContain('Lote Silver')
  })

  it('ao clicar nos botões de atalho, navega para a rota correspondente', async () => {
    obterStatusGlobal.mockResolvedValue({
      totalEmAndamento: 1,
      ingestoes: [
        { fonteId: 10, fonteNome: 'CAR Ingestão', fase: 'LENDO_REGISTROS', registrosProcessados: 50, percentual: 50, emExecucao: true },
      ],
      migracoesSilver: [
        { loteId: 42, fonteNome: 'CAR Ingestão', fase: 'RETIDO_QUARENTENA', percentual: 60, totalRegistros: 100, registrosProcessados: 60, errosEncontrados: 2, statusFinal: 'RETIDO_QUARENTENA', emExecucao: true },
      ],
      migracaoGold: null,
    })

    const { abrirPainel } = useMonitoramentoGlobal()
    abrirPainel()

    wrapper = mount(PainelMonitoramentoGlobal)
    await flushPromises()

    // Clica no atalho de fontes
    const btnFonte = wrapper.find('.btn-atalho-tarefa')
    await btnFonte.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/fontes')

    // Clica no atalho de quarentena
    const btnQuarentena = wrapper.find('.btn-atalho--alerta')
    await btnQuarentena.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/quarentena?loteId=42')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useMonitoramentoGlobal } from './useMonitoramentoGlobal'
import { obterStatusGlobal } from '../services/monitoramentoService'

vi.mock('../services/monitoramentoService', () => ({
  obterStatusGlobal: vi.fn(),
}))

describe('useMonitoramentoGlobal composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    const { pararPolling } = useMonitoramentoGlobal()
    pararPolling()
  })

  it('inicializa com estado padrão e computa totais corretamente', async () => {
    obterStatusGlobal.mockResolvedValue({
      totalEmAndamento: 2,
      ingestoes: [
        { fonteId: 1, fonteNome: 'CAR PR', fase: 'LENDO_REGISTROS', registrosProcessados: 50, totalEstimado: 100, percentual: 50, emExecucao: true },
      ],
      migracoesSilver: [
        { loteId: 10, fonteNome: 'CAR PR', fase: 'VALIDANDO_REGRAS', percentual: 70, emExecucao: true },
      ],
      migracaoGold: null,
    })

    const { atualizarStatus, totalEmAndamento, ingestoes, migracoesSilver, temTarefas } = useMonitoramentoGlobal()

    await atualizarStatus()

    expect(totalEmAndamento.value).toBe(2)
    expect(ingestoes.value).toHaveLength(1)
    expect(migracoesSilver.value).toHaveLength(1)
    expect(temTarefas.value).toBe(true)
  })

  it('permite alternar e persistir abertura do painel', () => {
    const { painelAberto, alternarPainel, fecharPainel, abrirPainel } = useMonitoramentoGlobal()

    abrirPainel()
    expect(painelAberto.value).toBe(true)
    expect(localStorage.getItem('datagis_monitoramento_aberto')).toBe('true')

    fecharPainel()
    expect(painelAberto.value).toBe(false)
    expect(localStorage.getItem('datagis_monitoramento_aberto')).toBe('false')

    alternarPainel()
    expect(painelAberto.value).toBe(true)
  })

  it('alterna abas ativas', () => {
    const { abaAtiva, definirAba } = useMonitoramentoGlobal()

    definirAba('INGESTAO')
    expect(abaAtiva.value).toBe('INGESTAO')

    definirAba('GOLD')
    expect(abaAtiva.value).toBe('GOLD')
  })
})

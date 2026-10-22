import { ref, computed } from 'vue'
import { obterStatusGlobal } from '../services/monitoramentoService'

// Estado Singleton reativo compartilhado por todos os componentes da aplicação
const statusGlobal = ref({
  totalEmAndamento: 0,
  ingestoes: [],
  migracoesSilver: [],
  migracaoGold: null,
})

const carregando = ref(false)
const erro = ref(null)
const painelAberto = ref(localStorage.getItem('datagis_monitoramento_aberto') === 'true')
const abaAtiva = ref('TODAS') // 'TODAS' | 'INGESTAO' | 'SILVER' | 'GOLD'

let timerPolling = null
let pollingAtivo = false

export function useMonitoramentoGlobal() {
  const totalEmAndamento = computed(() => statusGlobal.value?.totalEmAndamento || 0)

  const ingestoes = computed(() => statusGlobal.value?.ingestoes || [])
  const migracoesSilver = computed(() => statusGlobal.value?.migracoesSilver || [])
  const migracaoGold = computed(() => statusGlobal.value?.migracaoGold || null)

  const temTarefas = computed(() => {
    return totalEmAndamento.value > 0
  })

  async function atualizarStatus() {
    try {
      carregando.value = true
      const dados = await obterStatusGlobal()
      statusGlobal.value = dados
      erro.value = null

      // Se surgiram tarefas em andamento e o painel nunca foi minimizado explicitamente, abre
      if (dados.totalEmAndamento > 0 && localStorage.getItem('datagis_monitoramento_aberto') === null) {
        painelAberto.value = true
      }
    } catch (e) {
      erro.value = e.message || 'Erro ao carregar monitoramento'
    } finally {
      carregando.value = false
    }
  }

  function programarProximoCiclo() {
    if (!pollingAtivo) return
    if (timerPolling) clearTimeout(timerPolling)

    // Polling adaptativo: 2s quando houver tarefas em execução, 8s quando tudo ocioso
    const intervalo = totalEmAndamento.value > 0 ? 2000 : 8000

    timerPolling = setTimeout(async () => {
      await atualizarStatus()
      programarProximoCiclo()
    }, intervalo)
  }

  function iniciarPolling() {
    if (pollingAtivo) return
    pollingAtivo = true
    atualizarStatus().then(() => {
      programarProximoCiclo()
    })
  }

  function pararPolling() {
    pollingAtivo = false
    if (timerPolling) {
      clearTimeout(timerPolling)
      timerPolling = null
    }
  }

  async function forcarAtualizacao() {
    await atualizarStatus()
    painelAberto.value = true
    localStorage.setItem('datagis_monitoramento_aberto', 'true')
    programarProximoCiclo()
  }

  function alternarPainel() {
    painelAberto.value = !painelAberto.value
    localStorage.setItem('datagis_monitoramento_aberto', String(painelAberto.value))
  }

  function abrirPainel() {
    painelAberto.value = true
    localStorage.setItem('datagis_monitoramento_aberto', 'true')
  }

  function fecharPainel() {
    painelAberto.value = false
    localStorage.setItem('datagis_monitoramento_aberto', 'false')
  }

  function definirAba(aba) {
    abaAtiva.value = aba
  }

  return {
    statusGlobal,
    carregando,
    erro,
    painelAberto,
    abaAtiva,
    totalEmAndamento,
    ingestoes,
    migracoesSilver,
    migracaoGold,
    temTarefas,
    atualizarStatus,
    iniciarPolling,
    pararPolling,
    forcarAtualizacao,
    alternarPainel,
    abrirPainel,
    fecharPainel,
    definirAba,
  }
}

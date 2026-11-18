<script setup>
import { ref, onMounted, watch } from 'vue'
import { buscarDiagnostico } from '../services/quarentenaService'

const props = defineProps({
  loteId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['top-inconsistencia'])

const carregando = ref(false)
const erro = ref(null)
const temDados = ref(false)
const totalInconsistencias = ref(0)
const expandido = ref(false)
const listaDiagnostico = ref([])

const DICIONARIO_ROTULOS = {
  REFERENCIA_NAO_ENCONTRADA: 'Referência Não Encontrada',
  TIPO_DE_DADO_INVALIDO: 'Tipo de Dado Inválido',
  CAMPO_OBRIGATORIO_AUSENTE: 'Campo Obrigatório Ausente',
  FORA_DO_RECORTE_TERRITORIAL: 'Fora do Recorte Territorial (PR)',
  GEOMETRIA_NULA: 'Geometria Nula ou Ausente',
  REGRESSAO_DE_VALOR: 'Regressão de Valor (RN006)',
  VALOR_FORA_DO_DOMINIO: 'Valor Fora do Domínio'
}

function formatarRotuloAmigavel(codigo) {
  if (!codigo) return 'Outro'
  return DICIONARIO_ROTULOS[codigo] || codigo.replace(/_/g, ' ')
}

const PALETA_CORES = [
  '#ea580c', '#f59e0b', '#d97706', '#dc2626', '#7c3aed', '#0284c7', '#475569'
]

function calcularPercentual(qtd) {
  if (!totalInconsistencias.value || totalInconsistencias.value === 0) return '0.00'
  return ((qtd / totalInconsistencias.value) * 100).toFixed(2)
}

function exportarCsv() {
  if (listaDiagnostico.value.length === 0) return
  let csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
  csvContent += 'Código;Categoria de Regra;Volumetria;Impacto (%)\n'
  
  listaDiagnostico.value.forEach(item => {
    const rotulo = formatarRotuloAmigavel(item.tipoErro)
    const pct = calcularPercentual(item.quantidade)
    csvContent += `"${item.tipoErro}";"${rotulo}";${item.quantidade};${pct}%\n`
  })
  
  const link = document.createElement('a')
  link.setAttribute('href', encodeURI(csvContent))
  link.setAttribute('download', `diagnostico_quarentena_lote_${props.loteId || 'geral'}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function alternarTabela() {
  expandido.value = !expandido.value
}

async function carregarDados() {
  carregando.value = true
  erro.value = null
  try {
    const dados = await buscarDiagnostico({ 
      loteIngestaoId: props.loteId ? Number(props.loteId) : undefined 
    })
    
    if (!dados || dados.length === 0) {
      temDados.value = false
      totalInconsistencias.value = 0
      listaDiagnostico.value = []
      emit('top-inconsistencia', null)
      return
    }

    temDados.value = true
    const dadosOrdenados = [...dados].sort((a, b) => b.quantidade - a.quantidade)
    listaDiagnostico.value = dadosOrdenados
    totalInconsistencias.value = dadosOrdenados.reduce((acc, curr) => acc + curr.quantidade, 0)
    
    emit('top-inconsistencia', {
      rotulo: formatarRotuloAmigavel(dadosOrdenados[0].tipoErro),
      quantidade: dadosOrdenados[0].quantidade
    })
  } catch (err) {
    erro.value = err.message
  } finally {
    carregando.value = false
  }
}

onMounted(carregarDados)
watch(() => props.loteId, carregarDados)

defineExpose({ recarregar: carregarDados })
</script>

<template>
  <div class="diagnostico-wrapper">
    <div v-if="carregando" class="estado-msg">
      <div class="spinner-sm"></div>
      <span>A atualizar diagnóstico da quarentena...</span>
    </div>

    <div v-else-if="erro" class="alerta-erro">
      Falha ao carregar diagnóstico: {{ erro }}
    </div>

    <div v-else-if="!temDados" class="estado-vazio">
      Nenhuma inconsistência retida para o lote ou filtro selecionado.
    </div>

    <template v-else>
      <div class="card-secao">
        <div class="card-header" @click="alternarTabela" role="button">
          <div class="header-titulos">
            <h3 class="diagnostico-titulo">Detalhamento de Inconsistências</h3>
            <span class="diagnostico-sub">Tabela analítica com opção de exportação de laudo</span>
          </div>
          <div class="acoes-header">
            <button type="button" class="btn-exportar" @click.stop="exportarCsv">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Exportar CSV</span>
            </button>
            <button type="button" class="btn-toggle-acordeao">
              <span>{{ expandido ? 'Recolher Tabela' : 'Expandir Tabela' }}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'icone-rotacionado': !expandido }">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
        </div>
        
        <div v-show="expandido" class="corpo-secao">
          <div class="tabela-container">
            <table class="tabela-diagnostico">
              <thead>
                <tr>
                  <th>Categoria de Regra</th>
                  <th>Volumetria</th>
                  <th>Impacto (%)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in listaDiagnostico" :key="item.tipoErro">
                  <td class="col-categoria">
                    <span class="ponto-cor" :style="{ backgroundColor: PALETA_CORES[idx % PALETA_CORES.length] }"></span>
                    <span class="rotulo-erro">{{ formatarRotuloAmigavel(item.tipoErro) }}</span>
                  </td>
                  <td class="valor-negrito">
                    {{ item.quantidade.toLocaleString('pt-BR') }}
                  </td>
                  <td>
                    <span class="valor-percentual">{{ calcularPercentual(item.quantidade) }}%</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped src="../styles/components/DiagnosticoChart.css"></style>

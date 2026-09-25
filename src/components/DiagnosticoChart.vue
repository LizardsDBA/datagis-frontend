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

<style scoped>
.diagnostico-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-secao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: #ffffff;
  cursor: pointer;
  user-select: none;
}

.card-header:hover {
  background: #f8fafc;
}

.header-titulos {
  display: flex;
  flex-direction: column;
}

.diagnostico-titulo {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.diagnostico-sub {
  font-size: 0.76rem;
  color: #64748b;
}

.acoes-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-toggle-acordeao {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: color 0.15s ease;
  padding: 0;
}

.btn-toggle-acordeao:hover {
  color: #0f172a;
}

.btn-toggle-acordeao svg {
  width: 1.1rem;
  height: 1.1rem;
  transition: transform 0.2s ease;
}

.icone-rotacionado {
  transform: rotate(180deg);
}

.btn-exportar {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-exportar:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

.btn-exportar svg {
  width: 0.9rem;
  height: 0.9rem;
}

.corpo-secao {
  padding: 0 1.25rem 1.25rem;
  border-top: 1px solid #f1f5f9;
  margin-top: 0.25rem;
  padding-top: 1rem;
}

.tabela-container {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.tabela-diagnostico {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

/* Bordas em todas as células para criar o formato de grid de dados */
.tabela-diagnostico th,
.tabela-diagnostico td {
  border: 1px solid #e2e8f0;
  padding: 0.6rem 0.85rem;
  text-align: left;
}

.tabela-diagnostico th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  text-transform: uppercase;
}

.tabela-diagnostico td {
  color: #334155;
}

.col-categoria {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: none !important; /* Remove a borda interna do flex container */
}

/* Restaura a borda externa da célula da categoria */
.tabela-diagnostico td:first-child {
  border: 1px solid #e2e8f0 !important;
}

.ponto-cor {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.rotulo-erro {
  font-weight: 600;
}

.valor-negrito {
  font-weight: 700;
  font-family: inherit;
}

.valor-percentual {
  color: #64748b;
  font-weight: 600;
}

.estado-msg, .estado-vazio {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 80px;
  font-size: 0.82rem;
  color: #64748b;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.alerta-erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 0.8rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid #cbd5e1;
  border-top-color: #d97706;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
}

@keyframes girar {
  to { transform: rotate(360deg); }
}
</style>
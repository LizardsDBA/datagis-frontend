<script setup>
import { ref, computed } from 'vue'
import { descartarItem, iniciarAnaliseItem, reprocessarItem } from '../services/quarentenaService'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close', 'atualizado'])

const enviando = ref(false)
const erroAcao = ref(null)
const motivoDescarte = ref('')
const modoEdicao = ref(false)
const payloadEditado = ref(formatarJson(props.item.payloadOriginal))

function formatarJson(raw) {
  if (!raw) return ''
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return JSON.stringify(parsed, null, 2)
  } catch (e) {
    return String(raw)
  }
}

const badgeTipoErroClass = computed(() => {
  const err = props.item.tipoErroCodigo || ''
  if (err.includes('GEOMETRIA') || err.includes('TERRITORIAL')) return 'badge--espacial'
  if (err.includes('CPF') || err.includes('DOMINIO') || err.includes('REFERENCIA')) return 'badge--negocio'
  if (err.includes('REGRESSAO')) return 'badge--regressao'
  return 'badge--padrao'
})

const badgeStatusClass = computed(() => {
  const st = props.item.statusAnaliseCodigo || ''
  if (st === 'PENDENTE') return 'status--pendente'
  if (st === 'EM_ANALISE') return 'status--analise'
  if (st === 'CORRIGIDO_REPROCESSADO') return 'status--sucesso'
  if (st === 'DESCARTADO') return 'status--descartado'
  return ''
})

async function onIniciarAnalise() {
  enviando.value = true
  erroAcao.value = null
  try {
    await iniciarAnaliseItem(props.item.entidade, props.item.id)
    emit('atualizado')
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    enviando.value = false
  }
}

async function onDescartar() {
  if (!motivoDescarte.value.trim()) {
    erroAcao.value = 'Informe a justificativa para o descarte deste registro.'
    return
  }
  enviando.value = true
  erroAcao.value = null
  try {
    await descartarItem(props.item.entidade, props.item.id, motivoDescarte.value)
    emit('atualizado')
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    enviando.value = false
  }
}

async function onReprocessar() {
  enviando.value = true
  erroAcao.value = null
  try {
    await reprocessarItem(props.item.entidade, props.item.id, payloadEditado.value)
    emit('atualizado')
    emit('close')
  } catch (err) {
    erroAcao.value = err.message
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-container">
      <!-- Topo / Cabeçalho -->
      <header class="modal-header">
        <div class="header-info">
          <div class="header-tag">
            <span class="tag-entidade">{{ item.entidade }}</span>
            <span :class="['badge-status', badgeStatusClass]">{{ item.statusAnaliseDescricao || item.statusAnaliseCodigo }}</span>
          </div>
          <h2 class="chave-registro">{{ item.chaveIdentificacao || 'Registro sem chave' }}</h2>
          <span class="fonte-origem">Fonte: {{ item.fonteDadoNome || ('ID ' + item.fonteDadoId) }} • Lote #{{ item.loteIngestaoId }}</span>
        </div>
        <button class="btn-fechar" @click="emit('close')" title="Fechar modal">&times;</button>
      </header>

      <div class="modal-corpo">
        <!-- Alerta do Erro / Inconsistência -->
        <section class="secao-inconsistencia">
          <div class="inconsistencia-topo">
            <span :class="['badge-erro', badgeTipoErroClass]">
              {{ item.tipoErroCodigo }}
            </span>
            <span class="erro-descricao">{{ item.tipoErroDescricao }}</span>
          </div>

          <div class="detalhes-grid">
            <div class="detalhe-item">
              <span class="label">Campo com Inconsistência:</span>
              <code class="valor-destaque">{{ item.campoProblema || 'Não especificado' }}</code>
            </div>
            <div class="detalhe-item">
              <span class="label">Valor Recebido:</span>
              <span class="valor-recebido">{{ item.valorRecebido !== null ? item.valorRecebido : '(nulo / ausente)' }}</span>
            </div>
          </div>

          <div class="motivo-box">
            <strong>Motivo da Rejeição:</strong>
            <p>{{ item.motivoRejeicao }}</p>
          </div>
        </section>

        <!-- Visualizador e Editor do Payload JSON -->
        <section class="secao-payload">
          <div class="payload-header">
            <h3>Payload Original (Bronze)</h3>
            <button class="btn-secundario-sm" @click="modoEdicao = !modoEdicao">
              {{ modoEdicao ? 'Visualizar' : 'Editar Correção Manual' }}
            </button>
          </div>

          <div v-if="!modoEdicao" class="json-viewer">
            <pre><code>{{ formatarJson(item.payloadOriginal) }}</code></pre>
          </div>

          <div v-else class="json-editor">
            <label class="label">Correção manual pelo Operador (RN007):</label>
            <textarea
              v-model="payloadEditado"
              class="campo-textarea"
              rows="8"
              placeholder="Ajuste os atributos no payload JSON..."
            ></textarea>
            <small class="dica">O operador pode corrigir manualmente valores de referência ou atributos faltantes antes de submeter à revalidação.</small>
          </div>
        </section>

        <!-- Formulário de Descarte com Justificativa -->
        <section class="secao-descarte" v-if="item.statusAnaliseCodigo !== 'DESCARTADO' && item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'">
          <label class="label">Justificativa para Descarte (se irrecuperável):</label>
          <input
            v-model="motivoDescarte"
            type="text"
            class="campo-texto"
            placeholder="Ex.: Imóvel cancelado na base original; registro de teste sem correspondência..."
          />
        </section>

        <div v-if="erroAcao" class="alerta-erro">
          {{ erroAcao }}
        </div>
      </div>

      <!-- Rodapé com Ações -->
      <footer class="modal-footer">
        <button class="btn-cancelar" @click="emit('close')" :disabled="enviando">
          Cancelar
        </button>

        <div class="acoes-direita">
          <button
            v-if="item.statusAnaliseCodigo === 'PENDENTE'"
            class="btn-analise"
            @click="onIniciarAnalise"
            :disabled="enviando"
          >
            Iniciar Análise
          </button>

          <button
            v-if="item.statusAnaliseCodigo !== 'DESCARTADO' && item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'"
            class="btn-descartar"
            @click="onDescartar"
            :disabled="enviando"
          >
            Descartar Registro
          </button>

          <button
            v-if="item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'"
            class="btn-reprocessar"
            @click="onReprocessar"
            :disabled="enviando"
          >
            {{ enviando ? 'Processando...' : 'Revalidar & Promover' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-container {
  background: #ffffff;
  border-radius: 12px;
  width: 100%;
  max-width: 48rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.header-tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tag-entidade {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #e2e8f0;
  color: #475569;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.chave-registro {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
}

.fonte-origem {
  font-size: 0.82rem;
  color: #64748b;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.75rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.btn-fechar:hover {
  color: #1e293b;
}

.modal-corpo {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.secao-inconsistencia {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inconsistencia-topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge-erro {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  letter-spacing: 0.03em;
}

.badge--espacial {
  background: #ede9fe;
  color: #6d28d9;
}
.badge--negocio {
  background: #fef3c7;
  color: #b45309;
}
.badge--regressao {
  background: #fee2e2;
  color: #b91c1c;
}
.badge--padrao {
  background: #f1f5f9;
  color: #475569;
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
}
.status--pendente {
  background: #fef3c7;
  color: #b45309;
}
.status--analise {
  background: #e0f2fe;
  color: #0369a1;
}
.status--sucesso {
  background: #dcfce7;
  color: #15803d;
}
.status--descartado {
  background: #f1f5f9;
  color: #64748b;
}

.erro-descricao {
  font-size: 0.88rem;
  color: #881337;
  font-weight: 600;
}

.detalhes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  font-size: 0.85rem;
}

.detalhe-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label {
  font-weight: 600;
  color: #475569;
  font-size: 0.8rem;
}

.valor-destaque {
  font-family: var(--mono);
  background: #ffe4e6;
  color: #9f1239;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  display: inline-block;
}

.valor-recebido {
  font-weight: 600;
  color: #1e293b;
}

.motivo-box {
  background: #ffffff;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  color: #334155;
  border-left: 3px solid #e11d48;
}
.motivo-box p {
  margin: 0.2rem 0 0;
}

.secao-payload {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.payload-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.btn-secundario-sm {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-secundario-sm:hover {
  background: #e2e8f0;
}

.json-viewer {
  background: #0f172a;
  color: #38bdf8;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  max-height: 180px;
  overflow-y: auto;
  font-size: 0.8rem;
  font-family: var(--mono);
}
.json-viewer pre {
  margin: 0;
}

.json-editor {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.campo-textarea,
.campo-texto {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 0.82rem;
  color: #1e293b;
}
.campo-textarea:focus,
.campo-texto:focus {
  outline: none;
  border-color: #2e7d32;
  box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.2);
}

.dica {
  font-size: 0.75rem;
  color: #64748b;
}

.secao-descarte {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.alerta-erro {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
}

.modal-footer {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.acoes-direita {
  display: flex;
  gap: 0.6rem;
}

.btn-cancelar {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #64748b;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-cancelar:hover {
  background: #f1f5f9;
}

.btn-analise {
  background: #e0f2fe;
  color: #0284c7;
  border: 1px solid #bae6fd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-analise:hover {
  background: #bae6fd;
}

.btn-descartar {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-descartar:hover {
  background: #fecaca;
}

.btn-reprocessar {
  background: #2e7d32;
  color: #ffffff;
  border: none;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-reprocessar:hover {
  background: #1b5e20;
}
</style>

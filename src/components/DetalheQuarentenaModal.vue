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
const copiado = ref(false)
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

function copiarPayload() {
  navigator.clipboard.writeText(payloadEditado.value)
  copiado.value = true
  setTimeout(() => { copiado.value = false }, 2000)
}

const badgeTipoErroClass = computed(() => {
  const err = props.item.tipoErroCodigo || ''
  if (err.includes('GEOMETRIA') || err.includes('TERRITORIAL')) return 'badge-tag--espacial'
  if (err.includes('CPF') || err.includes('DOMINIO') || err.includes('REFERENCIA')) return 'badge-tag--alerta'
  if (err.includes('REGRESSAO')) return 'badge-tag--erro'
  return 'badge-tag--neutro'
})

const badgeStatusClass = computed(() => {
  const st = props.item.statusAnaliseCodigo || ''
  if (st === 'PENDENTE') return 'badge-tag--alerta'
  if (st === 'EM_ANALISE') return 'badge-tag--info'
  if (st === 'CORRIGIDO_REPROCESSADO') return 'badge-tag--sucesso'
  if (st === 'DESCARTADO') return 'badge-tag--neutro'
  return 'badge-tag--neutro'
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
            <span class="badge-tag" :class="badgeStatusClass">
              {{ item.statusAnaliseDescricao || item.statusAnaliseCodigo }}
            </span>
          </div>
          <h2 class="chave-registro">{{ item.chaveIdentificacao || 'Registro sem chave natural' }}</h2>
          <span class="fonte-origem">
            Fonte: <strong>{{ item.fonteDadoNome || ('ID ' + item.fonteDadoId) }}</strong> • Lote #{{ item.loteIngestaoId }}
          </span>
        </div>
        <button class="btn-fechar" @click="emit('close')" title="Fechar modal">&times;</button>
      </header>

      <div class="modal-corpo">
        <!-- Alerta do Erro / Inconsistência -->
        <section class="secao-inconsistencia">
          <div class="inconsistencia-topo">
            <span class="badge-tag" :class="badgeTipoErroClass">
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
              <span class="label">Valor Recebido da Origem:</span>
              <span class="valor-recebido">{{ item.valorRecebido !== null ? item.valorRecebido : '(nulo / ausente)' }}</span>
            </div>
          </div>

          <div class="motivo-box">
            <strong>Motivo Completo da Rejeição:</strong>
            <p>{{ item.motivoRejeicao }}</p>
          </div>
        </section>

        <!-- Visualizador e Editor do Payload JSON -->
        <section class="secao-payload">
          <div class="payload-header">
            <div>
              <h3>Payload Original (Camada Bronze)</h3>
              <p class="payload-sub">Dados brutos capturados na ingestão</p>
            </div>
            <div class="payload-acoes">
              <button class="btn-copiar-json" @click="copiarPayload" title="Copiar JSON para a área de transferência">
                {{ copiado ? '✓ Copiado!' : 'Copiar JSON' }}
              </button>
              <button class="btn-secundario-sm" @click="modoEdicao = !modoEdicao">
                {{ modoEdicao ? 'Visualizar Formatado' : 'Editar Correção Manual' }}
              </button>
            </div>
          </div>

          <div v-if="!modoEdicao" class="json-viewer">
            <pre><code>{{ formatarJson(item.payloadOriginal) }}</code></pre>
          </div>

          <div v-else class="json-editor">
            <label class="label">Correção Manual pelo Operador (RN007):</label>
            <textarea
              v-model="payloadEditado"
              class="campo-textarea"
              rows="9"
              placeholder="Ajuste os atributos no payload JSON..."
            ></textarea>
            <small class="dica">O operador pode corrigir manualmente códigos de domínio, nomes ou atributos faltantes. Ao revalidar, o registro é aprovado e aguarda a liberação conjunta do lote para ser transferido à Silver.</small>
          </div>
        </section>

        <!-- Formulário de Descarte com Justificativa -->
        <section class="secao-descarte" v-if="item.statusAnaliseCodigo !== 'DESCARTADO' && item.statusAnaliseCodigo !== 'CORRIGIDO_REPROCESSADO'">
          <label class="label">Justificativa para Descarte do Registro (se irrecuperável):</label>
          <input
            v-model="motivoDescarte"
            type="text"
            class="campo-texto"
            placeholder="Ex.: Imóvel cancelado na base original; registro teste sem correspondência..."
          />
        </section>

        <div v-if="erroAcao" class="alerta-erro">
          ✕ {{ erroAcao }}
        </div>
      </div>

      <!-- Rodapé com Ações -->
      <footer class="modal-footer">
        <button class="btn-cancelar" @click="emit('close')" :disabled="enviando">
          Fechar
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
            {{ enviando ? 'Revalidando...' : 'Revalidar & Aprovar' }}
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
  border-radius: 14px;
  width: 100%;
  max-width: 52rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
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
  gap: 1rem;
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
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #e2e8f0;
  color: #475569;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.chave-registro {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  word-break: break-all;
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
  color: #0f172a;
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
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.inconsistencia-topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.erro-descricao {
  font-size: 0.88rem;
  color: #881337;
  font-weight: 700;
}

.detalhes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  font-size: 0.85rem;
}

.detalhe-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label {
  font-weight: 700;
  color: #475569;
  font-size: 0.78rem;
}

.valor-destaque {
  font-family: var(--fonte-mono);
  background: #ffe4e6;
  color: #9f1239;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  display: inline-block;
  font-weight: 700;
}

.valor-recebido {
  font-weight: 600;
  color: #1e293b;
  word-break: break-all;
}

.motivo-box {
  background: #ffffff;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.86rem;
  color: #1e293b;
  border-left: 4px solid #e11d48;
}

.motivo-box p {
  margin: 0.25rem 0 0;
  line-height: 1.4;
  word-break: break-word;
}

.secao-payload {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.payload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.payload-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.payload-sub {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.payload-acoes {
  display: flex;
  gap: 0.5rem;
}

.btn-copiar-json,
.btn-secundario-sm {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-copiar-json:hover,
.btn-secundario-sm:hover {
  background: #e2e8f0;
}

.json-viewer {
  background: #0f172a;
  color: #38bdf8;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  max-height: 220px;
  overflow-y: auto;
  font-size: 0.8rem;
  font-family: var(--fonte-mono);
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
  padding: 0.65rem 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: var(--fonte-mono);
  font-size: 0.84rem;
  color: #1e293b;
  outline: none;
}

.campo-textarea:focus,
.campo-texto:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
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
  padding: 0.75rem 1rem;
  border-radius: 8px;
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
  flex-wrap: wrap;
  gap: 0.75rem;
}

.acoes-direita {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-cancelar {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
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
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-analise:hover {
  background: #bae6fd;
}

.btn-descartar {
  background: #ffffff;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-descartar:hover {
  background: #fee2e2;
}

.btn-reprocessar {
  background: #15803d;
  color: #ffffff;
  border: none;
  padding: 0.55rem 1.3rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-reprocessar:hover {
  background: #166534;
}

@media (max-width: 640px) {
  .modal-header {
    flex-direction: column;
    position: relative;
  }

  .btn-fechar {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  .modal-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .acoes-direita {
    flex-direction: column;
  }

  .btn-cancelar,
  .btn-analise,
  .btn-descartar,
  .btn-reprocessar {
    width: 100%;
    text-align: center;
  }
}
</style>

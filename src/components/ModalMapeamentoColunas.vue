<script setup>
import { ref, watch } from 'vue'
import { buscarMapeamentos, salvarMapeamentos, excluirMapeamento } from '../services/quarentenaService'

const props = defineProps({
  fonte: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['fechar'])

const mapeamentos = ref([])
const carregando = ref(false)
const salvando = ref(false)
const erro = ref(null)
const sucesso = ref(null)

const novoMapeamento = ref({
  colunaOrigem: '',
  atributoDestino: '',
  destinoTipo: 'COLUNA',
  tipoDado: 'TEXTO',
  obrigatorio: false,
  validarGeometria: false,
  validarCpfCnpj: false,
  validarRecortePr: false,
  impedirRegressao: true,
})

async function carregarMapeamentos() {
  if (!props.fonte?.id) return
  carregando.value = true
  erro.value = null
  try {
    mapeamentos.value = await buscarMapeamentos(props.fonte.id)
  } catch (e) {
    erro.value = e.message || 'Erro ao carregar mapeamentos de colunas'
  } finally {
    carregando.value = false
  }
}

watch(
  () => props.fonte,
  (novaFonte) => {
    if (novaFonte) {
      carregarMapeamentos()
    } else {
      mapeamentos.value = []
    }
  },
  { immediate: true }
)

async function adicionarMapeamento() {
  if (!novoMapeamento.value.colunaOrigem.trim() || !novoMapeamento.value.atributoDestino.trim()) {
    erro.value = 'Preencha a coluna de origem e o atributo de destino.'
    return
  }

  salvando.value = true
  erro.value = null
  sucesso.value = null

  try {
    const item = {
      ...novoMapeamento.value,
      colunaOrigem: novoMapeamento.value.colunaOrigem.trim(),
      atributoDestino: novoMapeamento.value.atributoDestino.trim(),
      fonteDadoId: props.fonte.id,
    }

    await salvarMapeamentos(props.fonte.id, [item])
    sucesso.value = 'Mapeamento salvo com sucesso!'
    
    // Limpar form
    novoMapeamento.value = {
      colunaOrigem: '',
      atributoDestino: '',
      destinoTipo: 'COLUNA',
      tipoDado: 'TEXTO',
      obrigatorio: false,
      validarGeometria: false,
      validarCpfCnpj: false,
      validarRecortePr: false,
      impedirRegressao: true,
    }

    await carregarMapeamentos()
  } catch (e) {
    erro.value = e.message || 'Falha ao salvar mapeamento.'
  } finally {
    salvando.value = false
  }
}

async function remover(id) {
  if (!confirm('Deseja realmente remover este mapeamento de coluna?')) return
  try {
    await excluirMapeamento(props.fonte.id, id)
    await carregarMapeamentos()
  } catch (e) {
    erro.value = e.message || 'Erro ao remover mapeamento.'
  }
}
</script>

<template>
  <div v-if="fonte" class="modal-backdrop" @click.self="emit('fechar')">
    <div class="modal-dialog">
      <header class="modal-header">
        <div>
          <span class="modal-etiqueta">DE-PARA DE ATRIBUTOS (BRONZE → SILVER)</span>
          <h2 class="modal-titulo">Mapeamento de Colunas — {{ fonte.nome }}</h2>
          <p class="modal-sub">
            Configure como os atributos do arquivo ou API serão convertidos e validados nas tabelas da camada Silver.
          </p>
        </div>
        <button class="btn-fechar" @click="emit('fechar')">✕</button>
      </header>

      <div class="modal-body">
        <div v-if="erro" class="alerta alerta--erro">{{ erro }}</div>
        <div v-if="sucesso" class="alerta alerta--sucesso">{{ sucesso }}</div>

        <!-- Formulário para Adicionar Mapeamento -->
        <section class="card-formulario">
          <h3 class="secao-titulo">Adicionar Novo Campo</h3>
          <form class="grid-form" @submit.prevent="adicionarMapeamento">
            <div class="campo">
              <label class="rotulo-campo">Coluna de Origem (Bronze/Arquivo) *</label>
              <input
                v-model="novoMapeamento.colunaOrigem"
                required
                placeholder="Ex: NUM_PROCESSO, cod_imovel, CPF_CNPJ"
                class="input-form"
              />
            </div>

            <div class="campo">
              <label class="rotulo-campo">Atributo Destino (Silver) *</label>
              <input
                v-model="novoMapeamento.atributoDestino"
                required
                placeholder="Ex: numeroProcesso, codigoImovel, documento"
                class="input-form"
              />
            </div>

            <div class="campo">
              <label class="rotulo-campo">Destino</label>
              <select v-model="novoMapeamento.destinoTipo" class="select-form">
                <option value="COLUNA">Coluna Tabela Silver</option>
                <option value="GEOMETRIA">Geometria Espacial</option>
                <option value="JSON">Atributos JSON (Metadados)</option>
              </select>
            </div>

            <div class="campo">
              <label class="rotulo-campo">Tipo de Dado</label>
              <select v-model="novoMapeamento.tipoDado" class="select-form">
                <option value="TEXTO">Texto (String)</option>
                <option value="NUMERO">Numérico (Inteiro / Decimal)</option>
                <option value="DATA">Data / Timestamp</option>
                <option value="GEOMETRIA_WKT">Geometria WKT</option>
                <option value="GEOMETRIA_GEOJSON">Geometria GeoJSON</option>
                <option value="BOOLEANO">Booleano</option>
              </select>
            </div>

            <div class="campo-checks">
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.obrigatorio" />
                <span>Obrigatório</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarGeometria" />
                <span>Validar Geometria</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarCpfCnpj" />
                <span>Validar CPF/CNPJ</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.validarRecortePr" />
                <span>Validar Limite PR</span>
              </label>
              <label class="check-item">
                <input type="checkbox" v-model="novoMapeamento.impedirRegressao" />
                <span>Bloquear Regressão</span>
              </label>
            </div>

            <div class="campo-btn">
              <button type="submit" class="btn-adicionar" :disabled="salvando">
                {{ salvando ? 'Gravando...' : '+ Mapear Campo' }}
              </button>
            </div>
          </form>
        </section>

        <!-- Tabela de Mapeamentos Cadastrados -->
        <section class="secao-tabela">
          <div class="secao-topo">
            <h3 class="secao-titulo">Colunas Atualmente Mapeadas ({{ mapeamentos.length }})</h3>
            <span v-if="carregando" class="spinner-sm"></span>
          </div>

          <div v-if="mapeamentos.length === 0 && !carregando" class="vazio">
            Nenhum de-para configurado para esta fonte. O pipeline armazenará colunas não mapeadas nos metadados gerais.
          </div>

          <div v-else class="tabela-responsiva-wrapper">
            <table class="tabela-mapeamentos">
              <thead>
                <tr>
                  <th>Coluna Origem</th>
                  <th>Atributo Silver</th>
                  <th>Destino</th>
                  <th>Tipo</th>
                  <th>Regras Ativas</th>
                  <th class="col-acoes"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="map in mapeamentos" :key="map.id">
                  <td class="coluna-fonte">
                    <code>{{ map.colunaOrigem }}</code>
                  </td>
                  <td class="coluna-silver">
                    <strong>{{ map.atributoDestino }}</strong>
                  </td>
                  <td>
                    <span class="badge-destino" :class="'badge--' + map.destinoTipo?.toLowerCase()">
                      {{ map.destinoTipo }}
                    </span>
                  </td>
                  <td>
                    <span class="tipo-tag">{{ map.tipoDado || 'TEXTO' }}</span>
                  </td>
                  <td class="regras-tags">
                    <span v-if="map.obrigatorio" class="tag-regra tag-regra--obrig">Obrigatório</span>
                    <span v-if="map.validarGeometria" class="tag-regra tag-regra--geo">Geometria</span>
                    <span v-if="map.validarCpfCnpj" class="tag-regra tag-regra--doc">CPF/CNPJ</span>
                    <span v-if="map.validarRecortePr" class="tag-regra tag-regra--pr">Paraná</span>
                    <span v-if="map.impedirRegressao" class="tag-regra tag-regra--regr">Anti-regressão</span>
                  </td>
                  <td class="col-acoes">
                    <button class="btn-excluir" title="Excluir mapeamento" @click="remover(map.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <button class="btn-fechar-modal" @click="emit('fechar')">Fechar</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
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

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 960px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #15803d;
  text-transform: uppercase;
}

.modal-titulo {
  margin: 0.2rem 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}

.modal-sub {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.btn-fechar:hover {
  color: #0f172a;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.alerta {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.alerta--erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--sucesso {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.card-formulario {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem;
}

.secao-titulo {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.grid-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rotulo-campo {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.input-form,
.select-form {
  padding: 0.6rem 0.85rem;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #1e293b;
  transition: border-color 0.15s ease;
}

.input-form:focus,
.select-form:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.campo-checks {
  grid-column: span 2;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  background: #ffffff;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.check-item input {
  accent-color: #15803d;
  width: 1rem;
  height: 1rem;
}

.campo-btn {
  grid-column: span 2;
  display: flex;
  justify-content: flex-end;
}

.btn-adicionar {
  background: #15803d;
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.4rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-adicionar:hover:not(:disabled) {
  background: #166534;
}

.btn-adicionar:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.secao-tabela {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.secao-topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tabela-mapeamentos {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}

.tabela-mapeamentos th {
  background: #f8fafc;
  padding: 0.75rem 0.95rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-mapeamentos td {
  padding: 0.85rem 0.95rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.tabela-mapeamentos tr:last-child td {
  border-bottom: none;
}

.coluna-fonte code {
  background: #f1f5f9;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
}

.coluna-silver strong {
  color: #1e293b;
  font-size: 0.86rem;
}

.badge-destino {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--coluna {
  background: #dbeafe;
  color: #1e40af;
}

.badge--geometria {
  background: #fef3c7;
  color: #92400e;
}

.badge--json {
  background: #ede9fe;
  color: #5b21b6;
}

.tipo-tag {
  font-size: 0.75rem;
  color: #64748b;
  font-family: var(--fonte-mono);
}

.regras-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag-regra {
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-weight: 700;
  white-space: nowrap;
}

.tag-regra--obrig {
  background: #fee2e2;
  color: #991b1b;
}

.tag-regra--geo {
  background: #fef9c3;
  color: #854d0e;
}

.tag-regra--doc {
  background: #e0f2fe;
  color: #0369a1;
}

.tag-regra--pr {
  background: #dcfce7;
  color: #166534;
}

.tag-regra--regr {
  background: #f3e8ff;
  color: #6b21a8;
}

.col-acoes {
  width: 40px;
  text-align: right;
}

.btn-excluir {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-excluir svg {
  width: 1rem;
  height: 1rem;
}

.btn-excluir:hover {
  color: #ef4444;
  background: #fee2e2;
}

.vazio {
  padding: 2rem;
  text-align: center;
  color: #64748b;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
  font-size: 0.86rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  background: #fafbfc;
}

.btn-fechar-modal {
  padding: 0.55rem 1.3rem;
  background: #e2e8f0;
  border: none;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}

.btn-fechar-modal:hover {
  background: #cbd5e1;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid #cbd5e1;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .grid-form {
    grid-template-columns: 1fr;
  }

  .campo-checks,
  .campo-btn {
    grid-column: span 1;
  }
}
</style>

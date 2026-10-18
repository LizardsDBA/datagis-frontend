<script setup>
import { ref, watch } from 'vue'
import { buscarMapeamentos, salvarMapeamentos, excluirMapeamento } from '../services/quarentenaService'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

// Quem so visualiza fontes ve o de-para, mas nao edita (fonte:gerenciar, LIZARDS-45)
const podeEditar = temPermissao(PERMISSOES.FONTE_GERENCIAR)

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
  id: null,
  colunaOrigem: '',
  atributoDestino: '',
  destinoTipo: 'COLUNA',
  tipoDado: 'TEXTO',
  obrigatorio: false,
  valorMinimo: null,
  tabelaReferencia: '',
  referenciaEntidadeSilver: '',
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
      cancelarEdicao()
      carregarMapeamentos()
    } else {
      mapeamentos.value = []
    }
  },
  { immediate: true }
)

function editar(map) {
  novoMapeamento.value = {
    id: map.id,
    colunaOrigem: map.colunaOrigem,
    atributoDestino: map.atributoDestino,
    destinoTipo: map.destinoTipo || 'COLUNA',
    tipoDado: map.tipoDado || 'TEXTO',
    obrigatorio: !!map.obrigatorio,
    valorMinimo: map.valorMinimo ?? null,
    tabelaReferencia: map.tabelaReferencia || '',
    referenciaEntidadeSilver: map.referenciaEntidadeSilver || '',
    validarGeometria: !!map.validarGeometria,
    validarCpfCnpj: !!map.validarCpfCnpj,
    validarRecortePr: !!map.validarRecortePr,
    impedirRegressao: map.impedirRegressao !== false,
  }
  sucesso.value = null
  erro.value = null
  // Scroll suave até o formulário
  const formEl = document.querySelector('.card-formulario')
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth' })
}

function cancelarEdicao() {
  novoMapeamento.value = {
    id: null,
    colunaOrigem: '',
    atributoDestino: '',
    destinoTipo: 'COLUNA',
    tipoDado: 'TEXTO',
    obrigatorio: false,
    valorMinimo: null,
    tabelaReferencia: '',
    referenciaEntidadeSilver: '',
    validarGeometria: false,
    validarCpfCnpj: false,
    validarRecortePr: false,
    impedirRegressao: true,
  }
}

async function salvarCampo() {
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
      referenciaEntidadeSilver: novoMapeamento.value.referenciaEntidadeSilver?.trim() || null,
      tabelaReferencia: novoMapeamento.value.tabelaReferencia?.trim() || null,
      valorMinimo:
        novoMapeamento.value.valorMinimo !== '' && novoMapeamento.value.valorMinimo !== null
          ? Number(novoMapeamento.value.valorMinimo)
          : null,
      fonteDadoId: props.fonte.id,
    }

    await salvarMapeamentos(props.fonte.id, [item])
    sucesso.value = novoMapeamento.value.id
      ? `Mapeamento do campo "${item.colunaOrigem}" atualizado com sucesso!`
      : `Novo mapeamento para "${item.colunaOrigem}" criado com sucesso!`

    cancelarEdicao()
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
    if (novoMapeamento.value.id === id) {
      cancelarEdicao()
    }
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
            Configure regras de conversão, tipos de dados e validações (integridade cruzada, domínio, geometrias e CPF/CNPJ).
          </p>
        </div>
        <button class="btn-fechar" @click="emit('fechar')">✕</button>
      </header>

      <div class="modal-body">
        <div v-if="erro" class="alerta alerta--erro">{{ erro }}</div>
        <div v-if="sucesso" class="alerta alerta--sucesso">{{ sucesso }}</div>

        <!-- Formulário para Adicionar / Editar Mapeamento -->
        <section v-if="podeEditar" class="card-formulario" :class="{ 'card-formulario--editando': novoMapeamento.id }">
          <div class="secao-topo-form">
            <h3 class="secao-titulo">
              {{ novoMapeamento.id ? `Editar Mapeamento: ${novoMapeamento.colunaOrigem}` : 'Adicionar Novo Campo' }}
            </h3>
            <span v-if="novoMapeamento.id" class="badge-editando">Modo Edição (ID: {{ novoMapeamento.id }})</span>
          </div>

          <form class="grid-form" @submit.prevent="salvarCampo">
            <div class="campo">
              <label class="rotulo-campo">Coluna de Origem (Bronze/Payload) *</label>
              <input
                v-model="novoMapeamento.colunaOrigem"
                required
                placeholder="Ex: cod_municipio_ibge, num_tad, cpf_cnpj"
                class="input-form"
              />
            </div>

            <div class="campo">
              <label class="rotulo-campo">Atributo Destino (Silver) *</label>
              <input
                v-model="novoMapeamento.atributoDestino"
                required
                placeholder="Ex: municipio, numero_termo, cpf_cnpj"
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
                <option value="texto">Texto (String)</option>
                <option value="numero">Numérico (Inteiro / Decimal)</option>
                <option value="cpf_cnpj">Documento (CPF / CNPJ)</option>
                <option value="data_iso">Data ISO / Timestamp</option>
                <option value="wkt">Geometria WKT</option>
                <option value="booleano">Booleano</option>
              </select>
            </div>

            <!-- Regra de Integridade Cruzada (Referência Silver) -->
            <div class="campo">
              <label class="rotulo-campo">
                Integridade Cruzada (Ref. Silver)
                <span class="dica-info" title="Valida se o valor existe na tabela canônica da Silver indicada. Se não existir, rejeita para a Quarentena.">ℹ</span>
              </label>
              <select v-model="novoMapeamento.referenciaEntidadeSilver" class="select-form">
                <option value="">(Nenhuma validação cruzada)</option>
                <option value="municipio">municipio — Valida código em SILVER.MUNICIPIO</option>
                <option value="imovel_rural">imovel_rural — Valida chave em SILVER.IMOVEL_RURAL</option>
                <option value="area_protegida">area_protegida — Valida código em SILVER.AREA_PROTEGIDA</option>
                <option value="auto_infracao">auto_infracao — Valida número em SILVER.AUTO_INFRACAO</option>
                <option value="embargo_ambiental">embargo_ambiental — Valida termo em SILVER.EMBARGO_AMBIENTAL</option>
              </select>
            </div>

            <!-- Regra de Domínio (Tabela Referência) -->
            <div class="campo">
              <label class="rotulo-campo">
                Validação de Domínio (Lookup)
                <span class="dica-info" title="Valida se o código/descrição pertence à tabela de domínio cadastrada.">ℹ</span>
              </label>
              <select v-model="novoMapeamento.tabelaReferencia" class="select-form">
                <option value="">(Nenhuma tabela de domínio)</option>
                <optgroup label="Imóvel Rural (CAR)">
                  <option value="situacao_imovel">situacao_imovel (AT, PE, CA, SU...)</option>
                  <option value="condicao_imovel">condicao_imovel (Aguardando análise, Em análise...)</option>
                  <option value="tipo_imovel">tipo_imovel (IRU, AST, PCT...)</option>
                </optgroup>
                <optgroup label="Área Protegida (UC / TI)">
                  <option value="tipo_area_protegida">tipo_area_protegida (Proteção Integral, Uso Sustentável, TI...)</option>
                  <option value="categoria_area_protegida">categoria_area_protegida (PARNA, REBIO, FLONA, APA...)</option>
                  <option value="orgao">orgao (ICMBio, IBAMA, FUNAI, IAT, INPE...)</option>
                  <option value="bioma">bioma (Mata Atlântica, Cerrado, Amazônia...)</option>
                </optgroup>
                <optgroup label="Auto de Infração">
                  <option value="tipo_auto_infracao">tipo_auto_infracao (Multa simples, Advertência, Apreensão...)</option>
                  <option value="tipo_infracao">tipo_infracao (Contra a flora, fauna, poluição...)</option>
                  <option value="tipo_pessoa">tipo_pessoa (PF, PJ)</option>
                  <option value="status_auto_infracao">status_auto_infracao (Lavrado, Homologado, Julgado...)</option>
                  <option value="orgao">orgao (IBAMA, ICMBio, IAT...)</option>
                </optgroup>
                <optgroup label="Embargo Ambiental">
                  <option value="tipo_area_embargo">tipo_area_embargo (Desmatamento, Queimada, Exploração irregular...)</option>
                  <option value="orgao">orgao (IBAMA, ICMBio, IAT...)</option>
                </optgroup>
                <optgroup label="Desmatamento (PRODES)">
                  <option value="classe_prodes">classe_prodes (Desmatamento, Não floresta, Floresta...)</option>
                  <option value="satelite">satelite (AQUA, TERRA, GOES-16, NOAA-20, LANDSAT...)</option>
                  <option value="sensor">sensor (MODIS, VIIRS, OLI, ETM...)</option>
                </optgroup>
                <optgroup label="Foco de Calor">
                  <option value="satelite">satelite (AQUA, TERRA, GOES-16, NOAA-20...)</option>
                  <option value="bioma">bioma (Mata Atlântica, Cerrado, Amazônia...)</option>
                </optgroup>
                <optgroup label="Município / Território">
                  <option value="unidade_federativa">unidade_federativa (PR, SP, RJ, SC...)</option>
                  <option value="bioma">bioma (Mata Atlântica, Cerrado, Amazônia...)</option>
                </optgroup>
              </select>
            </div>

            <!-- Valor Mínimo -->
            <div class="campo">
              <label class="rotulo-campo">
                Valor Mínimo (Limite Inferior)
                <span class="dica-info" title="Rejeita valores numéricos menores que este limite (ex.: área > 0).">ℹ</span>
              </label>
              <input
                type="number"
                step="any"
                v-model.number="novoMapeamento.valorMinimo"
                placeholder="Ex: 0.0, 1980"
                class="input-form"
              />
            </div>

            <!-- Checkboxes de Validação -->
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
                <span>Validar CPF/CNPJ (Módulo 11)</span>
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

            <!-- Botões de Ação do Form -->
            <div class="campo-btn">
              <button
                v-if="novoMapeamento.id"
                type="button"
                class="btn-cancelar"
                @click="cancelarEdicao"
              >
                Cancelar
              </button>
              <button type="submit" class="btn-adicionar" :disabled="salvando">
                {{ salvando ? 'Gravando...' : novoMapeamento.id ? 'Salvar Alterações' : '+ Mapear Campo' }}
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
                  <th v-if="podeEditar" class="col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="map in mapeamentos"
                  :key="map.id"
                  :class="{ 'linha-ativa': novoMapeamento.id === map.id }"
                >
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
                    <span class="tipo-tag">{{ map.tipoDado || 'texto' }}</span>
                  </td>
                  <td class="regras-tags">
                    <!-- Regras de Flags -->
                    <span v-if="map.obrigatorio" class="tag-regra tag-regra--obrig">Obrigatório</span>
                    <span v-if="map.validarGeometria" class="tag-regra tag-regra--geo">Geometria</span>
                    <span v-if="map.validarCpfCnpj" class="tag-regra tag-regra--doc">CPF/CNPJ</span>
                    <span v-if="map.validarRecortePr" class="tag-regra tag-regra--pr">Paraná</span>
                    <span v-if="map.impedirRegressao" class="tag-regra tag-regra--regr">Anti-regressão</span>

                    <!-- Regra de Integridade Cruzada (Ref Silver) -->
                    <span
                      v-if="map.referenciaEntidadeSilver"
                      class="tag-regra tag-regra--ref"
                      :title="'Integridade Cruzada ativa contra SILVER.' + map.referenciaEntidadeSilver"
                    >
                      Ref: {{ map.referenciaEntidadeSilver }}
                    </span>

                    <!-- Regra de Domínio -->
                    <span
                      v-if="map.tabelaReferencia"
                      class="tag-regra tag-regra--dom"
                      :title="'Validação de domínio ativa contra SILVER.' + map.tabelaReferencia"
                    >
                      Domínio: {{ map.tabelaReferencia }}
                    </span>

                    <!-- Regra de Valor Mínimo -->
                    <span
                      v-if="map.valorMinimo !== null && map.valorMinimo !== undefined"
                      class="tag-regra tag-regra--min"
                      :title="'Valor numérico mínimo exigido: ' + map.valorMinimo"
                    >
                      ≥ {{ map.valorMinimo }}
                    </span>
                  </td>
                  <td v-if="podeEditar" class="col-acoes">
                    <button
                      class="btn-editar"
                      title="Editar regras deste campo"
                      @click="editar(map)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      class="btn-excluir"
                      title="Excluir mapeamento"
                      @click="remover(map.id)"
                    >
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
  padding: 1.5rem;
}

.modal-dialog {
  background: #ffffff;
  width: 100%;
  max-width: 1050px;
  max-height: 90vh;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-aparecer 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-aparecer {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #15803d;
  display: inline-block;
  margin-bottom: 0.25rem;
}

.modal-titulo {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}

.modal-sub {
  margin: 0.3rem 0 0;
  font-size: 0.84rem;
  color: #64748b;
  max-width: 750px;
  line-height: 1.4;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.btn-fechar:hover {
  background: #f1f5f9;
  color: #334155;
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
  border-radius: 12px;
  padding: 1.25rem;
  transition: all 0.2s ease;
}

.card-formulario--editando {
  background: #f0fdf4;
  border-color: #86efac;
  box-shadow: 0 4px 12px rgba(22, 101, 52, 0.08);
}

.secao-topo-form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.secao-titulo {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.badge-editando {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  background: #dcfce7;
  color: #15803d;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
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
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.dica-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #cbd5e1;
  color: #1e293b;
  font-size: 0.65rem;
  cursor: help;
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
  gap: 1.25rem;
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
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancelar {
  padding: 0.65rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancelar:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.btn-adicionar {
  padding: 0.65rem 1.4rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 8px;
  background: #15803d;
  color: #ffffff;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-adicionar:hover:not(:disabled) {
  background: #166534;
}

.btn-adicionar:disabled {
  opacity: 0.6;
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
  justify-content: space-between;
}

.tabela-responsiva-wrapper {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
}

.tabela-mapeamentos {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.tabela-mapeamentos th {
  padding: 0.75rem 1rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.tabela-mapeamentos td {
  padding: 0.85rem 1rem;
  font-size: 0.84rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.tabela-mapeamentos tr:last-child td {
  border-bottom: none;
}

.tabela-mapeamentos tr:hover {
  background: #f8fafc;
}

.linha-ativa {
  background: #f0fdf4 !important;
}

.coluna-fonte code {
  background: #f1f5f9;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: var(--fonte-mono, monospace);
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
  font-family: var(--fonte-mono, monospace);
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

.tag-regra--ref {
  background: #e0e7ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}

.tag-regra--dom {
  background: #ccfbf1;
  color: #115e59;
  border: 1px solid #99f6e4;
}

.tag-regra--min {
  background: #ffedd5;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.col-acoes {
  width: 80px;
  text-align: right;
  white-space: nowrap;
}

.btn-editar,
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
  transition: all 0.15s ease;
}

.btn-editar svg,
.btn-excluir svg {
  width: 1rem;
  height: 1rem;
}

.btn-editar:hover {
  color: #0284c7;
  background: #e0f2fe;
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
  transition: background 0.15s ease;
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
  animation: girar 0.6s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup>
/**
 * Tela de Conjunto de Dados — compara, por lote, o mesmo registro nas camadas Bronze,
 * Silver e Quarentena. Sempre mostra o último lote da fonte que chegou na Silver
 * (status PROMOVIDO_SILVER), direto ou via liberação manual — não distingue os dois
 * casos, o status final é o mesmo.
 *
 * Tela nova e isolada — não reaproveita nada de QuarentenaView.vue/ConjuntosView.vue de
 * propósito, só a mesma ideia visual (cards, tabela, badges).
 */
import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '../services/http'
import { useRoute } from 'vue-router'
import {
  buscarUltimoLote,
  buscarBronze,
  buscarSilver,
  buscarQuarentenaDoLote,
  buscarNaListaPorRegistroBruto,
  buscarRegistroBronzePorId,
  buscarRegistroSilverPorId,
} from '../services/conjuntosDadosService'
import ModalVisualizarGeometria from './ModalVisualizarGeometria.vue'
import ModalRegistroCamada from './ModalRegistroCamada.vue'
import ModalComparacaoCamadas from './ModalComparacaoCamadas.vue'
import { temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'

const route = useRoute()
const fonteId = route.params.fonteId

const TAMANHO_PAGINA = 25

const CAMADAS = [
  { valor: 'BRONZE', rotulo: 'Bronze' },
  { valor: 'SILVER', rotulo: 'Silver' },
  { valor: 'QUARENTENA', rotulo: 'Quarentena' },
]

const QUARENTENA_ROTULOS = {
  chaveIdentificacao: 'Identificação',
  tipoErroDescricao: 'Tipo de erro',
  campoProblema: 'Campo com problema',
  valorRecebido: 'Valor recebido',
  motivoRejeicao: 'Motivo da rejeição',
  statusAnaliseDescricao: 'Status',
  dataQuarentena: 'Data da quarentena',
}

const carregandoInicial = ref(true)
const erroInicial = ref(null)
const loteResumo = ref(null)

const camadaAtiva = ref('BRONZE')
const pagina = ref(0)
const total = ref(0)
const itensAtuais = ref([])
const carregandoTabela = ref(false)
const erroTabela = ref(null)

const quarentenaItensBrutos = ref([])
const quarentenaCarregada = ref(false)

const modalGeometria = ref(null) // { titulo, wkt }
const modalRegistro = ref(null) // { titulo, dados, mensagemVazio }
const modalComparacao = ref(null) // { registroBrutoId, parInicial }

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / TAMANHO_PAGINA)))

const colunasDinamicas = computed(() => {
  const chaves = new Set()
  for (const item of itensAtuais.value) {
    Object.keys(item.dados || {}).forEach((chave) => chaves.add(chave))
  }
  return Array.from(chaves)
})

// A aba Quarentena le /api/quarentena: so aparece pra quem tem quarentena:visualizar.
// O Analista ve Bronze e Silver; o Operador e o Auditor veem as tres (LIZARDS-46).
const camadasPermitidas = CAMADAS.filter(
  (c) => c.valor !== 'QUARENTENA' || temPermissao(PERMISSOES.QUARENTENA_VISUALIZAR),
)
const outrasCamadas = computed(() => camadasPermitidas.map((c) => c.valor).filter((v) => v !== camadaAtiva.value))

function normalizarItemQuarentena(item) {
  const dados = {}
  for (const [chave, rotulo] of Object.entries(QUARENTENA_ROTULOS)) {
    dados[rotulo] = item[chave] ?? '—'
  }
  return dados
}

async function garantirQuarentenaCarregada() {
  if (quarentenaCarregada.value) return
  const resposta = await buscarQuarentenaDoLote(loteResumo.value.loteId)
  quarentenaItensBrutos.value = resposta
  quarentenaCarregada.value = true
}

async function carregarPaginaAtual() {
  if (!loteResumo.value) return
  carregandoTabela.value = true
  erroTabela.value = null
  try {
    if (camadaAtiva.value === 'BRONZE') {
      const resultado = await buscarBronze(loteResumo.value.loteId, pagina.value, TAMANHO_PAGINA)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else if (camadaAtiva.value === 'SILVER') {
      const resultado = await buscarSilver(loteResumo.value.loteId, pagina.value, TAMANHO_PAGINA)
      itensAtuais.value = resultado.itens
      total.value = resultado.total
    } else {
      await garantirQuarentenaCarregada()
      total.value = quarentenaItensBrutos.value.length
      const inicio = pagina.value * TAMANHO_PAGINA
      itensAtuais.value = quarentenaItensBrutos.value
        .slice(inicio, inicio + TAMANHO_PAGINA)
        .map((item) => ({
          registroBrutoId: item.registroBrutoId,
          temGeometria: false,
          geometriaWkt: null,
          dados: normalizarItemQuarentena(item),
        }))
    }
  } catch (e) {
    erroTabela.value = e.message
  } finally {
    carregandoTabela.value = false
  }
}

const idCopiadoRecentemente = ref(null)

async function copiarPayload(registro) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(registro.dados, null, 2))
    idCopiadoRecentemente.value = registro.registroBrutoId
    setTimeout(() => {
      if (idCopiadoRecentemente.value === registro.registroBrutoId) idCopiadoRecentemente.value = null
    }, 1500)
  } catch (e) {
    erroTabela.value = 'Não foi possível copiar: ' + e.message
  }
}

function trocarCamada(valor) {
  if (camadaAtiva.value === valor) return
  camadaAtiva.value = valor
  pagina.value = 0
  carregarPaginaAtual()
}

function irParaPagina(novaPagina) {
  if (novaPagina < 0 || novaPagina >= totalPaginas.value) return
  pagina.value = novaPagina
  carregarPaginaAtual()
}

function verGeometria(registro) {
  modalGeometria.value = {
    titulo: `Geometria — registro #${registro.registroBrutoId}`,
    wkt: registro.geometriaWkt,
  }
}

async function verEmCamada(registro, camadaDestino) {
  const rotuloCamada = CAMADAS.find((c) => c.valor === camadaDestino)?.rotulo || camadaDestino
  const titulo = `Registro #${registro.registroBrutoId} — ${rotuloCamada}`
  try {
    if (camadaDestino === 'BRONZE') {
      const resultado = await buscarRegistroBronzePorId(registro.registroBrutoId)
      modalRegistro.value = { titulo, dados: resultado.dados, mensagemVazio: null }
    } else if (camadaDestino === 'SILVER') {
      const resultado = await buscarRegistroSilverPorId(registro.registroBrutoId)
      modalRegistro.value = {
        titulo,
        dados: resultado?.dados || null,
        mensagemVazio: 'Este registro não chegou a virar uma linha na Silver (pode ter perdido uma deduplicação dentro do próprio lote).',
      }
    } else {
      await garantirQuarentenaCarregada()
      const item = buscarNaListaPorRegistroBruto(quarentenaItensBrutos.value, registro.registroBrutoId)
      modalRegistro.value = {
        titulo,
        dados: item ? normalizarItemQuarentena(item) : null,
        mensagemVazio: 'Este registro não foi para a Quarentena — passou direto pela validação.',
      }
    }
  } catch (e) {
    modalRegistro.value = { titulo, dados: null, mensagemVazio: e.message }
  }
}

// Quarentena não tem comparação: o registro rejeitado não existe na Silver nem na Gold.
function compararRegistro(registro) {
  modalComparacao.value = {
    registroBrutoId: registro.registroBrutoId,
    parInicial: camadaAtiva.value === 'SILVER' ? 'SILVER_GOLD' : 'BRONZE_SILVER',
  }
}

function rotuloCamada(valor) {
  return CAMADAS.find((c) => c.valor === valor)?.rotulo || valor
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

onMounted(async () => {
  try {
    const [fonteResp, loteResp] = await Promise.all([
      apiFetch(`/api/fontes/${fonteId}`).then((r) => (r.ok ? r.json() : null)),
      buscarUltimoLote(fonteId),
    ])
    loteResumo.value = { ...loteResp, fonteDadoNomeExibicao: fonteResp?.nome || loteResp.fonteDadoNome }
    await carregarPaginaAtual()
  } catch (e) {
    erroInicial.value = e.message
  } finally {
    carregandoInicial.value = false
  }
})
</script>

<template>
  <div class="pagina-conjunto-dados">
    <header class="topo-pagina">
      <p class="etiqueta">CONJUNTO DE DADOS</p>
      <h1 class="titulo">{{ loteResumo?.fonteDadoNomeExibicao || 'Carregando…' }}</h1>
      <p v-if="loteResumo" class="subtitulo">
        Lote #{{ loteResumo.loteId }} — {{ loteResumo.quantidadeRegistros }} registros —
        promovido em {{ formatarData(loteResumo.dataExecucao) }}
      </p>
    </header>

    <div v-if="carregandoInicial" class="estado-carregando">
      <div class="spinner-grande"></div>
      <span>Carregando…</span>
    </div>

    <div v-else-if="erroInicial" class="estado-vazio estado-vazio--erro">
      <p>{{ erroInicial }}</p>
    </div>

    <template v-else>
      <div class="seletor-camadas">
        <button
          v-for="camada in camadasPermitidas"
          :key="camada.valor"
          class="botao-camada"
          :class="{ 'botao-camada--ativo': camadaAtiva === camada.valor }"
          @click="trocarCamada(camada.valor)"
        >
          {{ camada.rotulo }}
        </button>
      </div>

      <section class="cartao">
        <div v-if="carregandoTabela" class="estado-carregando">
          <div class="spinner-grande"></div>
          <span>Carregando {{ rotuloCamada(camadaAtiva) }}…</span>
        </div>

        <div v-else-if="erroTabela" class="estado-vazio estado-vazio--erro">{{ erroTabela }}</div>

        <div v-else-if="!itensAtuais.length" class="estado-vazio">
          Nenhum registro encontrado na camada {{ rotuloCamada(camadaAtiva) }} para este lote.
        </div>

        <div v-else class="tabela-responsiva-wrapper">
          <table class="tabela-dados">
            <thead>
              <tr>
                <th v-for="coluna in colunasDinamicas" :key="coluna">{{ coluna }}</th>
                <th class="col-acoes-titulo">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in itensAtuais" :key="item.registroBrutoId">
                <td v-for="coluna in colunasDinamicas" :key="coluna">
                  {{ item.dados?.[coluna] === null || item.dados?.[coluna] === undefined ? '—' : item.dados[coluna] }}
                </td>
                <td class="celula-acoes">
                  <div class="grupo-botoes-linha">
                    <button
                      class="botao-icone"
                      title="Copiar payload (JSON)"
                      @click="copiarPayload(item)"
                    >
                      {{ idCopiadoRecentemente === item.registroBrutoId ? '✓ Copiado' : 'Copiar' }}
                    </button>
                    <button
                      v-if="item.temGeometria"
                      class="botao-icone"
                      title="Ver geometria"
                      @click="verGeometria(item)"
                    >
                      Mapa
                    </button>
                    <button
                      v-if="camadaAtiva !== 'QUARENTENA'"
                      class="botao-icone botao-icone--comparar"
                      title="Comparar com a camada vizinha (Bronze → Silver → Gold)"
                      @click="compararRegistro(item)"
                    >
                      Comparar
                    </button>
                    <button
                      v-for="destino in outrasCamadas"
                      :key="destino"
                      class="botao-icone botao-icone--texto"
                      :title="'Ver na ' + rotuloCamada(destino)"
                      @click="verEmCamada(item, destino)"
                    >
                      {{ rotuloCamada(destino) }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="itensAtuais.length" class="controles-paginacao">
          <button :disabled="pagina === 0" @click="irParaPagina(pagina - 1)">← Anterior</button>
          <span>Página {{ pagina + 1 }} de {{ totalPaginas }} ({{ total }} registros)</span>
          <button :disabled="pagina + 1 >= totalPaginas" @click="irParaPagina(pagina + 1)">Próxima →</button>
        </div>
      </section>
    </template>

    <ModalVisualizarGeometria
      v-if="modalGeometria"
      :titulo="modalGeometria.titulo"
      :wkt="modalGeometria.wkt"
      @fechar="modalGeometria = null"
    />

    <ModalRegistroCamada
      v-if="modalRegistro"
      :titulo="modalRegistro.titulo"
      :dados="modalRegistro.dados"
      :mensagem-vazio="modalRegistro.mensagemVazio || undefined"
      @fechar="modalRegistro = null"
    />

    <ModalComparacaoCamadas
      v-if="modalComparacao"
      :registro-bruto-id="modalComparacao.registroBrutoId"
      :par-inicial="modalComparacao.parInicial"
      @fechar="modalComparacao = null"
    />
  </div>
</template>

<style scoped>
.pagina-conjunto-dados {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.topo-pagina {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.etiqueta {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #15803d;
}

.titulo {
  font-size: 1.5rem;
  color: #0f172a;
  margin: 0;
}

.subtitulo {
  margin: 0.15rem 0 0;
  font-size: 0.88rem;
  color: #64748b;
}

.seletor-camadas {
  display: inline-flex;
  gap: 0.4rem;
  background: #f1f5f9;
  padding: 0.3rem;
  border-radius: 10px;
  width: fit-content;
}

.botao-camada {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.botao-camada--ativo {
  background: #ffffff;
  color: #15803d;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.cartao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
}

.tabela-responsiva-wrapper {
  overflow-x: auto;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tabela-dados th {
  text-align: left;
  padding: 0.7rem 0.85rem;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-dados td {
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

.col-acoes-titulo {
  text-align: right;
}

.celula-acoes {
  text-align: right;
  white-space: nowrap;
}

.grupo-botoes-linha {
  display: inline-flex;
  gap: 0.35rem;
}

.botao-icone {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.78rem;
  cursor: pointer;
  color: #334155;
  transition: all 0.12s ease;
}

.botao-icone--comparar {
  color: #15803d;
  border-color: #86efac;
}

.botao-icone:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.controles-paginacao {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #475569;
}

.controles-paginacao button {
  padding: 0.4rem 0.9rem;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  cursor: pointer;
}

.controles-paginacao button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.estado-carregando,
.estado-vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
  gap: 0.6rem;
  text-align: center;
}

.estado-vazio--erro {
  color: #991b1b;
}

.spinner-grande {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e2e8f0;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: girar 0.65s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup>
/**
 * Modal de comparação entre lotes consecutivos da mesma fonte de dados
 * (LIZARDS-30). Exibe um diff no estilo GitHub: registros adicionados,
 * removidos, modificados e inalterados, com paginação e filtros por situação.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { buscarComparacaoLotes } from '../services/conjuntosDadosService'

const props = defineProps({
  fonteDadoId: { type: Number, required: true },
  fonteDadoNome: { type: String, default: '' },
})
const emit = defineEmits(['fechar'])

const TAMANHO_PAGINA = 25

const FILTROS = [
  { valor: null, rotulo: 'Todos' },
  { valor: 'ADICIONADO', rotulo: 'Adicionados', icone: '+', classe: 'badge--add' },
  { valor: 'REMOVIDO', rotulo: 'Removidos', icone: '−', classe: 'badge--del' },
  { valor: 'MODIFICADO', rotulo: 'Modificados', icone: '~', classe: 'badge--mod' },
  { valor: 'INALTERADO', rotulo: 'Inalterados', icone: '=', classe: 'badge--ctx' },
]

const comparacao = ref(null)
const carregando = ref(false)
const erro = ref(null)
const filtroAtivo = ref(null)
const pagina = ref(0)
const expandidos = ref(new Set())

const totalPaginas = computed(() => {
  if (!comparacao.value) return 1
  return Math.max(1, Math.ceil(comparacao.value.totalRegistrosFiltrados / TAMANHO_PAGINA))
})

function texto(valor) {
  return valor === null || valor === undefined || valor === '' ? 'null' : String(valor)
}

function destacarMudanca(antigo, novo) {
  let inicio = 0
  while (inicio < antigo.length && inicio < novo.length && antigo[inicio] === novo[inicio]) inicio++
  let fimAntigo = antigo.length
  let fimNovo = novo.length
  while (fimAntigo > inicio && fimNovo > inicio && antigo[fimAntigo - 1] === novo[fimNovo - 1]) {
    fimAntigo--
    fimNovo--
  }
  const partes = (valor, fim) =>
    [
      { texto: valor.slice(0, inicio), destaque: false },
      { texto: valor.slice(inicio, fim), destaque: true },
      { texto: valor.slice(fim), destaque: false },
    ].filter((p) => p.texto !== '')
  return { antigo: partes(antigo, fimAntigo), novo: partes(novo, fimNovo) }
}

function toggleExpandido(index) {
  if (expandidos.value.has(index)) {
    expandidos.value.delete(index)
  } else {
    expandidos.value.add(index)
  }
  expandidos.value = new Set(expandidos.value) // force reactivity
}

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    comparacao.value = await buscarComparacaoLotes(
      props.fonteDadoId,
      pagina.value,
      TAMANHO_PAGINA,
      filtroAtivo.value,
    )
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function trocarFiltro(valor) {
  filtroAtivo.value = valor
  pagina.value = 0
  expandidos.value = new Set()
  carregar()
}

function irParaPagina(novaPagina) {
  if (novaPagina < 0 || novaPagina >= totalPaginas.value) return
  pagina.value = novaPagina
  expandidos.value = new Set()
  carregar()
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function classeSituacao(situacao) {
  switch (situacao) {
    case 'ADICIONADO':
      return 'registro--add'
    case 'REMOVIDO':
      return 'registro--del'
    case 'MODIFICADO':
      return 'registro--mod'
    default:
      return 'registro--ctx'
  }
}

function iconeSituacao(situacao) {
  switch (situacao) {
    case 'ADICIONADO':
      return '+'
    case 'REMOVIDO':
      return '−'
    case 'MODIFICADO':
      return '~'
    default:
      return '='
  }
}

function rotuloSituacao(situacao) {
  switch (situacao) {
    case 'ADICIONADO':
      return 'Adicionado'
    case 'REMOVIDO':
      return 'Removido'
    case 'MODIFICADO':
      return 'Modificado'
    default:
      return 'Inalterado'
  }
}

/** Removido só existe no lote anterior; os demais são lidos do lote atual. */
function idDoRegistro(reg) {
  return reg.situacao === 'REMOVIDO' ? reg.registroBrutoIdAnterior : reg.registroBrutoIdAtual
}

/** Linha no arquivo de origem; a linha 0 é válida (não pode sumir por ser "falsa"). */
function linhaDoRegistro(reg) {
  const linha = reg.situacao === 'REMOVIDO' ? reg.numeroLinhaAnterior : reg.numeroLinhaAtual
  return linha ?? null
}

/** Texto ao lado do título: com chave, "registro #11 · linha 0"; sem chave, "(linha 0)". */
function referenciaDoRegistro(reg) {
  const linha = linhaDoRegistro(reg)
  if (!reg.chave) return linha != null ? `(linha ${linha})` : ''
  return [`registro #${idDoRegistro(reg)}`, linha != null ? `linha ${linha}` : null].filter(Boolean).join(' · ')
}

function fecharComEsc(evento) {
  if (evento.key === 'Escape') emit('fechar')
}

function colunasDoRegistro(reg) {
  const chaves = new Set()
  if (reg.dadosAtual) Object.keys(reg.dadosAtual).forEach((k) => chaves.add(k))
  if (reg.dadosAnterior) Object.keys(reg.dadosAnterior).forEach((k) => chaves.add(k))
  return Array.from(chaves)
}

onMounted(() => {
  window.addEventListener('keydown', fecharComEsc)
  carregar()
})
onUnmounted(() => window.removeEventListener('keydown', fecharComEsc))
</script>

<template>
  <div class="fundo-modal" @click.self="emit('fechar')">
    <div class="caixa-modal">
      <div class="cabecalho-modal">
        <div>
          <h3>Comparação de Lotes</h3>
          <p class="subtitulo-modal">{{ fonteDadoNome || `Fonte #${fonteDadoId}` }}</p>
        </div>
        <button class="botao-fechar" aria-label="Fechar" @click="emit('fechar')">✕</button>
      </div>

      <!-- Cabeçalho com info dos lotes -->
      <div v-if="comparacao && comparacao.loteAnteriorEncontrado" class="barra-lotes">
        <div class="info-lote info-lote--anterior">
          <span class="etiqueta-lote">Lote anterior</span>
          <span class="id-lote">#{{ comparacao.loteAnteriorId }}</span>
          <span class="data-lote">{{ formatarData(comparacao.dataLoteAnterior) }}</span>
        </div>
        <span class="seta-lotes">→</span>
        <div class="info-lote info-lote--atual">
          <span class="etiqueta-lote">Lote atual</span>
          <span class="id-lote">#{{ comparacao.loteAtualId }}</span>
          <span class="data-lote">{{ formatarData(comparacao.dataLoteAtual) }}</span>
        </div>
      </div>

      <!-- Cards de resumo -->
      <div v-if="comparacao && comparacao.loteAnteriorEncontrado" class="grade-resumo">
        <div class="card-resumo card-resumo--add">
          <span class="valor-resumo">{{ comparacao.resumo.adicionados }}</span>
          <span class="rotulo-resumo">Adicionados</span>
        </div>
        <div class="card-resumo card-resumo--del">
          <span class="valor-resumo">{{ comparacao.resumo.removidos }}</span>
          <span class="rotulo-resumo">Removidos</span>
        </div>
        <div class="card-resumo card-resumo--mod">
          <span class="valor-resumo">{{ comparacao.resumo.modificados }}</span>
          <span class="rotulo-resumo">Modificados</span>
        </div>
        <div class="card-resumo card-resumo--ctx">
          <span class="valor-resumo">{{ comparacao.resumo.inalterados }}</span>
          <span class="rotulo-resumo">Inalterados</span>
        </div>
      </div>

      <!-- Filtros -->
      <div v-if="comparacao && comparacao.loteAnteriorEncontrado" class="barra-filtros">
        <button
          v-for="f in FILTROS"
          :key="f.valor ?? 'todos'"
          class="botao-filtro"
          :class="{ 'botao-filtro--ativo': filtroAtivo === f.valor }"
          @click="trocarFiltro(f.valor)"
        >
          <span v-if="f.icone" class="icone-filtro" :class="f.classe">{{ f.icone }}</span>
          {{ f.rotulo }}
        </button>
      </div>

      <!-- Estados -->
      <div v-if="carregando" class="estado-vazio">Comparando lotes…</div>
      <div v-else-if="erro" class="estado-vazio estado-vazio--erro">{{ erro }}</div>
      <div v-else-if="comparacao && !comparacao.loteAnteriorEncontrado" class="estado-vazio">
        {{ comparacao.mensagem }}
      </div>

      <!-- Lista de registros diff -->
      <div v-else-if="comparacao && comparacao.registros.length" class="lista-diff">
        <div
          v-for="(reg, idx) in comparacao.registros"
          :key="idx"
          class="item-diff"
          :class="classeSituacao(reg.situacao)"
        >
          <div class="cabecalho-item" @click="toggleExpandido(idx)">
            <span class="indicador-situacao" :class="classeSituacao(reg.situacao)">
              {{ iconeSituacao(reg.situacao) }}
            </span>
            <!-- O título é a chave natural (ex.: código CAR): é por ela que o usuário reconhece
                 o registro. O id interno e a linha ficam ao lado, só como referência. -->
            <span class="titulo-item" :title="comparacao.campoChave && reg.chave ? `${comparacao.campoChave}: ${reg.chave}` : ''">
              {{ reg.chave || `Registro #${idDoRegistro(reg)}` }}<span v-if="referenciaDoRegistro(reg)" class="numero-linha">{{ referenciaDoRegistro(reg) }}</span>
            </span>
            <span class="badge-situacao" :class="classeSituacao(reg.situacao)">
              {{ rotuloSituacao(reg.situacao) }}
            </span>
            <span v-if="reg.camposAlterados && reg.camposAlterados.length" class="contagem-campos">
              {{ reg.camposAlterados.length }} campo{{ reg.camposAlterados.length > 1 ? 's' : '' }}
            </span>
            <span class="chevron" :class="{ 'chevron--aberto': expandidos.has(idx) }">▸</span>
          </div>

          <!-- Detalhes expandidos -->
          <div v-if="expandidos.has(idx)" class="detalhe-item">
            <!-- Modificado: mostra os campos alterados como diff -->
            <template v-if="reg.situacao === 'MODIFICADO' && reg.camposAlterados.length">
              <table class="tabela-diff-campos">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Valor atual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(campo, ci) in reg.camposAlterados" :key="ci">
                    <td class="celula-campo">{{ campo.campo }}</td>
                    <td class="celula-valor celula-valor--del">
                      <template v-if="campo.valorAnterior !== null && campo.valorAnterior !== undefined">
                        <template
                          v-for="(p, pi) in destacarMudanca(
                            texto(campo.valorAnterior),
                            texto(campo.valorAtual),
                          ).antigo"
                          :key="pi"
                        >
                          <mark v-if="p.destaque" class="destaque destaque--del">{{ p.texto }}</mark>
                          <span v-else>{{ p.texto }}</span>
                        </template>
                      </template>
                      <span v-else class="valor-nulo">null</span>
                    </td>
                    <td class="celula-valor celula-valor--add">
                      <template v-if="campo.valorAtual !== null && campo.valorAtual !== undefined">
                        <template
                          v-for="(p, pi) in destacarMudanca(
                            texto(campo.valorAnterior),
                            texto(campo.valorAtual),
                          ).novo"
                          :key="pi"
                        >
                          <mark v-if="p.destaque" class="destaque destaque--add">{{ p.texto }}</mark>
                          <span v-else>{{ p.texto }}</span>
                        </template>
                      </template>
                      <span v-else class="valor-nulo">null</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- Adicionado / Removido / Inalterado: mostra os dados -->
            <template v-else>
              <table class="tabela-dados-registro">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="col in colunasDoRegistro(reg)" :key="col">
                    <td class="celula-campo">{{ col }}</td>
                    <td>
                      {{
                        reg.situacao === 'REMOVIDO'
                          ? texto(reg.dadosAnterior?.[col])
                          : texto(reg.dadosAtual?.[col])
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>
      </div>

      <div v-else-if="comparacao" class="estado-vazio">
        Nenhum registro encontrado com o filtro selecionado.
      </div>

      <!-- Paginação -->
      <div v-if="comparacao && comparacao.totalRegistrosFiltrados > TAMANHO_PAGINA" class="controles-paginacao">
        <button :disabled="pagina === 0" @click="irParaPagina(pagina - 1)">← Anterior</button>
        <span>
          Página {{ pagina + 1 }} de {{ totalPaginas }}
          ({{ comparacao.totalRegistrosFiltrados }} registros)
        </span>
        <button :disabled="pagina + 1 >= totalPaginas" @click="irParaPagina(pagina + 1)">Próxima →</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/modals/ModalComparacaoLotes.css"></style>

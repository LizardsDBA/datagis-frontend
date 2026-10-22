<script setup>
/**
 * Modal de comparação entre lotes consecutivos da mesma fonte de dados
 * (LIZARDS-30). Exibe um diff no estilo GitHub: registros adicionados,
 * removidos, modificados e inalterados, com paginação e filtros por situação.
 */
import { ref, computed, watch, onMounted } from 'vue'
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

function colunasDoRegistro(reg) {
  const chaves = new Set()
  if (reg.dadosAtual) Object.keys(reg.dadosAtual).forEach((k) => chaves.add(k))
  if (reg.dadosAnterior) Object.keys(reg.dadosAnterior).forEach((k) => chaves.add(k))
  return Array.from(chaves)
}

onMounted(carregar)
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
            <span class="titulo-item">
              <template v-if="reg.situacao === 'REMOVIDO'">
                Registro #{{ reg.registroBrutoIdAnterior }}
                <span v-if="reg.numeroLinhaAnterior" class="numero-linha">(linha {{ reg.numeroLinhaAnterior }})</span>
              </template>
              <template v-else>
                Registro #{{ reg.registroBrutoIdAtual }}
                <span v-if="reg.numeroLinhaAtual" class="numero-linha">(linha {{ reg.numeroLinhaAtual }})</span>
              </template>
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

<style scoped>
.fundo-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.caixa-modal {
  background: #ffffff;
  border-radius: 12px;
  width: min(1100px, 100%);
  max-height: 88vh;
  overflow: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.cabecalho-modal {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: #ffffff;
  z-index: 2;
}

.cabecalho-modal h3 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}

.subtitulo-modal {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.botao-fechar {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #64748b;
}

/* Barra de info dos lotes */
.barra-lotes {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 0.8rem 1.1rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.info-lote {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.etiqueta-lote {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.id-lote {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.data-lote {
  font-size: 0.78rem;
  color: #94a3b8;
}

.seta-lotes {
  font-size: 1.3rem;
  color: #94a3b8;
  font-weight: 700;
}

/* Grade de resumo */
.grade-resumo {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.6rem;
  padding: 0.8rem 1.1rem;
}

.card-resumo {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid;
}

.card-resumo--add {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.card-resumo--del {
  background: #fef2f2;
  border-color: #fecaca;
}

.card-resumo--mod {
  background: #fffbeb;
  border-color: #fde68a;
}

.card-resumo--ctx {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.valor-resumo {
  font-size: 1.4rem;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.card-resumo--add .valor-resumo {
  color: #15803d;
}

.card-resumo--del .valor-resumo {
  color: #dc2626;
}

.card-resumo--mod .valor-resumo {
  color: #d97706;
}

.card-resumo--ctx .valor-resumo {
  color: #64748b;
}

.rotulo-resumo {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

/* Filtros */
.barra-filtros {
  display: flex;
  gap: 0.3rem;
  padding: 0.6rem 1.1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.botao-filtro {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.botao-filtro:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.botao-filtro--ativo {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.icone-filtro {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.badge--add {
  background: #dcfce7;
  color: #15803d;
}

.badge--del {
  background: #fee2e2;
  color: #dc2626;
}

.badge--mod {
  background: #fef3c7;
  color: #d97706;
}

.badge--ctx {
  background: #f1f5f9;
  color: #64748b;
}

/* Lista de diff */
.lista-diff {
  padding: 0.6rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.item-diff {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s ease;
}

.item-diff:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.cabecalho-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.8rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s ease;
}

.cabecalho-item:hover {
  background: #f8fafc;
}

.indicador-situacao {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  flex-shrink: 0;
}

.indicador-situacao.registro--add {
  background: #dcfce7;
  color: #15803d;
}

.indicador-situacao.registro--del {
  background: #fee2e2;
  color: #dc2626;
}

.indicador-situacao.registro--mod {
  background: #fef3c7;
  color: #d97706;
}

.indicador-situacao.registro--ctx {
  background: #f1f5f9;
  color: #94a3b8;
}

.titulo-item {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  flex: 1;
}

.numero-linha {
  font-weight: 400;
  color: #94a3b8;
}

.badge-situacao {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.badge-situacao.registro--add {
  background: #dcfce7;
  color: #15803d;
}

.badge-situacao.registro--del {
  background: #fee2e2;
  color: #dc2626;
}

.badge-situacao.registro--mod {
  background: #fef3c7;
  color: #d97706;
}

.badge-situacao.registro--ctx {
  background: #f1f5f9;
  color: #94a3b8;
}

.contagem-campos {
  font-size: 0.75rem;
  color: #94a3b8;
}

.chevron {
  font-size: 0.7rem;
  color: #94a3b8;
  transition: transform 0.15s ease;
}

.chevron--aberto {
  transform: rotate(90deg);
}

/* Detalhe expandido */
.detalhe-item {
  border-top: 1px solid #e2e8f0;
  padding: 0.6rem 0.8rem;
  background: #fafbfc;
  overflow-x: auto;
}

.tabela-diff-campos,
.tabela-dados-registro {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.tabela-diff-campos th,
.tabela-dados-registro th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #e2e8f0;
}

.tabela-diff-campos td,
.tabela-dados-registro td {
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
  vertical-align: top;
  word-break: break-all;
  white-space: pre-wrap;
}

.celula-campo {
  color: #6e7781;
  font-weight: 600;
  white-space: nowrap;
  width: 1%;
}

.celula-valor--del {
  background: #ffebe9;
}

.celula-valor--add {
  background: #dafbe1;
}

.destaque--del {
  background: #ff818266;
  border-radius: 3px;
}

.destaque--add {
  background: #4ac26b66;
  border-radius: 3px;
}

.valor-nulo {
  color: #94a3b8;
  font-style: italic;
}

/* Paginação */
.controles-paginacao {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.8rem 1.1rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.controles-paginacao button {
  padding: 0.4rem 0.9rem;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
}

.controles-paginacao button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.estado-vazio {
  padding: 2rem 1.1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
}

.estado-vazio--erro {
  color: #991b1b;
}

/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .caixa-modal {
  background: var(--cor-superficie);
}

:root[data-tema="escuro"] .cabecalho-modal {
  border-bottom-color: var(--cor-borda);
  background: var(--cor-superficie);
}

:root[data-tema="escuro"] .cabecalho-modal h3 {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .subtitulo-modal {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .botao-fechar {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .barra-lotes {
  background: var(--cor-superficie-elevada);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .etiqueta-lote {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .id-lote {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .data-lote {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .seta-lotes {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .card-resumo--add {
  background: var(--cor-primaria-tenue);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .card-resumo--del {
  background: var(--tenue-erro);
  border-color: var(--cor-erro);
}

:root[data-tema="escuro"] .card-resumo--mod {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.3);
}

:root[data-tema="escuro"] .card-resumo--ctx {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .card-resumo--add .valor-resumo {
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .card-resumo--del .valor-resumo {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .card-resumo--mod .valor-resumo {
  color: #fbbf24;
}

:root[data-tema="escuro"] .card-resumo--ctx .valor-resumo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .rotulo-resumo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .barra-filtros {
  background: var(--cor-superficie-elevada);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .botao-filtro {
  background: var(--cor-superficie);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .botao-filtro:hover {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .botao-filtro--ativo {
  background: var(--cor-texto-titulo);
  color: var(--cor-superficie);
  border-color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .item-diff {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .cabecalho-item:hover {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .titulo-item {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .numero-linha {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .contagem-campos {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .chevron {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .detalhe-item {
  border-top-color: var(--cor-borda);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .tabela-diff-campos th,
:root[data-tema="escuro"] .tabela-dados-registro th {
  background: var(--cor-superficie);
  color: var(--cor-texto-rotulo);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-diff-campos td,
:root[data-tema="escuro"] .tabela-dados-registro td {
  border-bottom-color: var(--cor-borda-suave);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .celula-campo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .celula-valor--del {
  background: var(--tenue-erro);
}

:root[data-tema="escuro"] .celula-valor--add {
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .destaque--del {
  background: var(--cor-erro);
}

:root[data-tema="escuro"] .destaque--add {
  background: var(--cor-primaria);
}

:root[data-tema="escuro"] .valor-nulo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .controles-paginacao {
  border-top-color: var(--cor-borda);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .controles-paginacao button {
  border-color: var(--cor-borda);
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .estado-vazio {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .estado-vazio--erro {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .indicador-situacao.registro--add {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .indicador-situacao.registro--del {
  background: var(--tenue-erro);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .indicador-situacao.registro--mod {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

:root[data-tema="escuro"] .indicador-situacao.registro--ctx {
  background: var(--cor-superficie);
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .badge-situacao.registro--add {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .badge-situacao.registro--del {
  background: var(--tenue-erro);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .badge-situacao.registro--mod {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

:root[data-tema="escuro"] .badge-situacao.registro--ctx {
  background: var(--cor-superficie);
  color: var(--cor-texto-terciario);
}
</style>

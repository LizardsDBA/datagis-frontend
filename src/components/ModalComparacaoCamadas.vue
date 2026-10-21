<script setup>
/**
 * Diff de um registro entre camadas vizinhas (Bronze→Silver, Silver→Gold), no estilo do
 * diff do GitHub: cada campo vira uma linha `campo: valor`; o que mudou aparece como
 * uma linha removida (-, vermelha) seguida de uma adicionada (+, verde), com o trecho
 * alterado destacado. Visão unificada ou lado a lado.
 */
import { ref, computed, watch } from 'vue'
import { buscarComparacaoCamadas } from '../services/conjuntosDadosService'

const props = defineProps({
  registroBrutoId: { type: Number, required: true },
  // Par aberto de início: BRONZE_SILVER ou SILVER_GOLD.
  parInicial: { type: String, default: 'BRONZE_SILVER' },
})
const emit = defineEmits(['fechar'])

const PARES = [
  { valor: 'BRONZE_SILVER', origem: 'BRONZE', destino: 'SILVER', rotuloOrigem: 'Bronze', rotuloDestino: 'Silver' },
  { valor: 'SILVER_GOLD', origem: 'SILVER', destino: 'GOLD', rotuloOrigem: 'Silver', rotuloDestino: 'Gold' },
]

const parAtivo = ref(props.parInicial)
const comparacao = ref(null)
const carregando = ref(false)
const erro = ref(null)
const somenteDiferencas = ref(false)
const modo = ref('UNIFICADO') // UNIFICADO | LADO_A_LADO

const par = computed(() => PARES.find((p) => p.valor === parAtivo.value) || PARES[0])

function texto(valor) {
  return valor === null || valor === undefined || valor === '' ? 'null' : String(valor)
}

/**
 * Parte comum no começo e no fim fica normal; só o miolo que mudou é destacado — igual
 * ao realce de palavras do GitHub. Devolve as partes de cada lado.
 */
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

function linha(tipo, campo, valor, partes) {
  return { tipo, campo, partes: partes || [{ texto: texto(valor), destaque: false }] }
}

// Linhas do diff, já com a numeração de cada lado (antiga/nova), como o GitHub.
const linhas = computed(() => {
  const resultado = []
  let nAntigo = 0
  let nNovo = 0
  const campos = comparacao.value?.campos || []
  for (const c of campos) {
    if (c.situacao === 'IGUAL') {
      if (somenteDiferencas.value) {
        nAntigo++
        nNovo++
        continue
      }
      nAntigo++
      nNovo++
      resultado.push({ ...linha('ctx', c.campo, c.valorOrigem), nAntigo, nNovo })
    } else if (c.situacao === 'DIFERENTE') {
      const partes = destacarMudanca(texto(c.valorOrigem), texto(c.valorDestino))
      nAntigo++
      resultado.push({ ...linha('del', c.campo, c.valorOrigem, partes.antigo), nAntigo, nNovo: null })
      nNovo++
      resultado.push({ ...linha('add', c.campo, c.valorDestino, partes.novo), nAntigo: null, nNovo })
    } else if (c.situacao === 'SO_ORIGEM') {
      nAntigo++
      resultado.push({ ...linha('del', c.campo, c.valorOrigem), nAntigo, nNovo: null })
    } else {
      nNovo++
      resultado.push({ ...linha('add', c.campo, c.valorDestino), nAntigo: null, nNovo })
    }
  }
  return resultado
})

// Visão lado a lado: uma linha removida e a adicionada logo depois dela dividem a mesma fileira.
const fileiras = computed(() => {
  const resultado = []
  const lista = linhas.value
  for (let i = 0; i < lista.length; i++) {
    const atual = lista[i]
    if (atual.tipo === 'ctx') {
      resultado.push({ esquerda: atual, direita: atual })
    } else if (atual.tipo === 'del' && lista[i + 1]?.tipo === 'add' && lista[i + 1].campo === atual.campo) {
      resultado.push({ esquerda: atual, direita: lista[i + 1] })
      i++
    } else if (atual.tipo === 'del') {
      resultado.push({ esquerda: atual, direita: null })
    } else {
      resultado.push({ esquerda: null, direita: atual })
    }
  }
  return resultado
})

const adicionadas = computed(() => linhas.value.filter((l) => l.tipo === 'add').length)
const removidas = computed(() => linhas.value.filter((l) => l.tipo === 'del').length)

const SINAL = { ctx: ' ', del: '−', add: '+' }

async function carregar() {
  carregando.value = true
  erro.value = null
  comparacao.value = null
  try {
    comparacao.value = await buscarComparacaoCamadas(props.registroBrutoId, par.value.origem, par.value.destino)
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

watch(parAtivo, carregar, { immediate: true })
</script>

<template>
  <div class="fundo-modal" @click.self="emit('fechar')">
    <div class="caixa-modal">
      <div class="cabecalho-modal">
        <h3>Comparar registro #{{ registroBrutoId }}</h3>
        <button class="botao-fechar" aria-label="Fechar" @click="emit('fechar')">✕</button>
      </div>

      <div class="barra-controles">
        <div class="seletor">
          <button
            v-for="opcao in PARES"
            :key="opcao.valor"
            class="botao-seletor botao-par"
            :class="{ 'botao-seletor--ativo': parAtivo === opcao.valor }"
            @click="parAtivo = opcao.valor"
          >
            {{ opcao.rotuloOrigem }} → {{ opcao.rotuloDestino }}
          </button>
        </div>
        <div class="controles-direita">
          <label class="filtro-diferencas">
            <input v-model="somenteDiferencas" type="checkbox" />
            Só diferenças
          </label>
          <div class="seletor">
            <button
              class="botao-seletor botao-modo-unificado"
              :class="{ 'botao-seletor--ativo': modo === 'UNIFICADO' }"
              @click="modo = 'UNIFICADO'"
            >
              Unificado
            </button>
            <button
              class="botao-seletor botao-modo-lado"
              :class="{ 'botao-seletor--ativo': modo === 'LADO_A_LADO' }"
              @click="modo = 'LADO_A_LADO'"
            >
              Lado a lado
            </button>
          </div>
        </div>
      </div>

      <div v-if="carregando" class="estado-vazio">Comparando…</div>
      <div v-else-if="erro" class="estado-vazio estado-vazio--erro">{{ erro }}</div>
      <div v-else-if="comparacao && !comparacao.destinoEncontrado" class="estado-vazio">
        {{ comparacao.mensagem }}
      </div>

      <div v-else-if="comparacao" class="arquivo-diff">
        <div class="cabecalho-arquivo">
          <span class="nome-arquivo">
            {{ par.rotuloOrigem.toLowerCase() }}/registro-{{ registroBrutoId }}
            →
            {{ par.rotuloDestino.toLowerCase() }}/registro-{{ registroBrutoId }}
          </span>
          <span class="contagem">
            <span class="contagem--add">+{{ adicionadas }}</span>
            <span class="contagem--del">−{{ removidas }}</span>
          </span>
        </div>

        <div v-if="!linhas.length" class="estado-vazio">Nenhuma diferença entre as camadas.</div>

        <table v-else-if="modo === 'UNIFICADO'" class="tabela-diff tabela-unificada">
          <tbody>
            <tr v-for="(l, i) in linhas" :key="i" class="linha" :class="`linha--${l.tipo}`">
              <td class="numero">{{ l.nAntigo ?? '' }}</td>
              <td class="numero">{{ l.nNovo ?? '' }}</td>
              <td class="sinal">{{ SINAL[l.tipo] }}</td>
              <td class="codigo">
                <span class="campo">{{ l.campo + ': ' }}</span>
                <template v-for="(p, j) in l.partes" :key="j">
                  <mark v-if="p.destaque" class="destaque">{{ p.texto }}</mark>
                  <span v-else>{{ p.texto }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <table v-else class="tabela-diff tabela-lado">
          <tbody>
            <tr v-for="(f, i) in fileiras" :key="i">
              <template v-for="lado in ['esquerda', 'direita']" :key="lado">
                <td class="numero" :class="f[lado] ? `linha--${f[lado].tipo}` : 'linha--vazia'">
                  {{ f[lado] ? (lado === 'esquerda' ? f[lado].nAntigo : f[lado].nNovo) : '' }}
                </td>
                <td class="codigo" :class="f[lado] ? `linha--${f[lado].tipo}` : 'linha--vazia'">
                  <template v-if="f[lado]">
                    <span class="sinal-inline">{{ SINAL[f[lado].tipo] }}</span>
                    <span class="campo">{{ f[lado].campo + ': ' }}</span>
                    <template v-for="(p, j) in f[lado].partes" :key="j">
                      <mark v-if="p.destaque" class="destaque">{{ p.texto }}</mark>
                      <span v-else>{{ p.texto }}</span>
                    </template>
                  </template>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
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
  align-items: center;
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

.botao-fechar {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #64748b;
}

.barra-controles {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.8rem 1.1rem;
}

.controles-direita {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.seletor {
  display: inline-flex;
  gap: 0.3rem;
  background: #f1f5f9;
  padding: 0.25rem;
  border-radius: 10px;
}

.botao-seletor {
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}

.botao-seletor--ativo {
  background: #ffffff;
  color: #15803d;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.filtro-diferencas {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: #475569;
  cursor: pointer;
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

.arquivo-diff {
  margin: 0 1.1rem 1.1rem;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
}

.cabecalho-arquivo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.9rem;
  background: #f6f8fa;
  border-bottom: 1px solid #d0d7de;
  font-size: 0.82rem;
}

.nome-arquivo {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #1f2328;
}

.contagem {
  display: inline-flex;
  gap: 0.5rem;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.contagem--add {
  color: #1a7f37;
}

.contagem--del {
  color: #cf222e;
}

.tabela-diff {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}

.tabela-lado {
  table-layout: fixed;
}

.numero {
  width: 3.2rem;
  padding: 0 0.6rem;
  text-align: right;
  color: #6e7781;
  user-select: none;
  vertical-align: top;
  white-space: nowrap;
}

.sinal {
  width: 1.4rem;
  text-align: center;
  user-select: none;
  vertical-align: top;
}

.codigo {
  padding: 0 0.6rem;
  white-space: pre-wrap;
  word-break: break-all;
  color: #1f2328;
}

.campo {
  color: #6e7781;
}

.sinal-inline {
  display: inline-block;
  width: 1.4ch;
  user-select: none;
}

.linha--del,
.linha--del .numero,
.linha--del .sinal {
  background: #ffebe9;
}

.linha--add,
.linha--add .numero,
.linha--add .sinal {
  background: #dafbe1;
}

.numero.linha--del {
  background: #ffcecb;
}

.numero.linha--add {
  background: #aceebb;
}

.linha--vazia {
  background: #f6f8fa;
}

.linha--del .destaque,
.codigo.linha--del .destaque {
  background: #ff818266;
  border-radius: 3px;
}

.linha--add .destaque,
.codigo.linha--add .destaque {
  background: #4ac26b66;
  border-radius: 3px;
}

.tabela-lado .codigo + .numero {
  border-left: 1px solid #d0d7de;
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

:root[data-tema="escuro"] .botao-fechar {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .seletor {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .botao-seletor {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .botao-seletor--ativo {
  background: var(--cor-superficie-elevada);
  color: var(--cor-link);
}

:root[data-tema="escuro"] .filtro-diferencas {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .estado-vazio {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .estado-vazio--erro {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .arquivo-diff {
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .cabecalho-arquivo {
  background: var(--cor-superficie-elevada);
  border-bottom-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .nome-arquivo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .contagem--add {
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .contagem--del {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .numero {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .codigo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .campo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .linha--del,
:root[data-tema="escuro"] .linha--del .numero,
:root[data-tema="escuro"] .linha--del .sinal {
  background: var(--tenue-erro);
}

:root[data-tema="escuro"] .linha--add,
:root[data-tema="escuro"] .linha--add .numero,
:root[data-tema="escuro"] .linha--add .sinal {
  background: var(--cor-primaria-tenue);
}

/* Número da linha um degrau mais forte que a linha (12%), igual nos dois lados */
:root[data-tema="escuro"] .numero.linha--del {
  background: rgb(248 113 113 / 25%);
}

:root[data-tema="escuro"] .numero.linha--add {
  background: rgb(74 222 128 / 25%);
}

:root[data-tema="escuro"] .linha--vazia {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .linha--del .destaque,
:root[data-tema="escuro"] .codigo.linha--del .destaque {
  background: var(--cor-erro);
}

:root[data-tema="escuro"] .linha--add .destaque,
:root[data-tema="escuro"] .codigo.linha--add .destaque {
  background: var(--cor-primaria);
}

:root[data-tema="escuro"] .tabela-lado .codigo + .numero {
  border-left-color: var(--cor-borda-forte);
}
</style>

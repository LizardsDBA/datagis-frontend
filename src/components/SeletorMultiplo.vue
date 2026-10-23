<script setup>
/**
 * Seleção múltipla com busca. Mostra o que está marcado como etiquetas removíveis e abre uma
 * lista filtrável com caixas de marcação.
 *
 * Opção "bloqueada" aparece marcada e sem poder desmarcar (ex.: permissão que um perfil já dá);
 * ela não entra no v-model.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  /** [{ valor, rotulo, descricao?, bloqueado?, nota? }] */
  opcoes: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Selecione' },
  rotuloBusca: { type: String, default: 'Procurar' },
})

const emit = defineEmits(['update:modelValue'])

const raiz = ref(null)
const aberto = ref(false)
const termo = ref('')

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

const opcoesFiltradas = computed(() => {
  const t = normalizar(termo.value.trim())
  if (!t) return props.opcoes
  return props.opcoes.filter((o) => normalizar(`${o.rotulo} ${o.valor} ${o.descricao}`).includes(t))
})

const selecionadas = computed(() => props.opcoes.filter((o) => !o.bloqueado && props.modelValue.includes(o.valor)))
const totalBloqueadas = computed(() => props.opcoes.filter((o) => o.bloqueado).length)

function alternar(valor, marcado) {
  const lista = props.modelValue.filter((v) => v !== valor)
  emit('update:modelValue', marcado ? [...lista, valor] : lista)
}

function remover(valor) {
  alternar(valor, false)
}

function limpar() {
  emit('update:modelValue', [])
}

function aoClicarFora(evento) {
  if (raiz.value && !raiz.value.contains(evento.target)) aberto.value = false
}

onMounted(() => document.addEventListener('mousedown', aoClicarFora))
onUnmounted(() => document.removeEventListener('mousedown', aoClicarFora))
</script>

<template>
  <div ref="raiz" class="seletor" :class="{ 'seletor--aberto': aberto }">
    <div
      class="seletor-caixa"
      role="button"
      tabindex="0"
      :aria-expanded="aberto"
      @click="aberto = !aberto"
      @keydown.enter.prevent="aberto = !aberto"
    >
      <span v-for="opcao in selecionadas" :key="opcao.valor" class="seletor-etiqueta" :title="opcao.descricao">
        {{ opcao.rotulo }}
        <button
          type="button"
          class="seletor-remover"
          :aria-label="`Remover ${opcao.rotulo}`"
          @click.stop="remover(opcao.valor)"
        >
          ✕
        </button>
      </span>
      <span v-if="!selecionadas.length" class="seletor-placeholder">{{ placeholder }}</span>
      <span v-if="totalBloqueadas" class="seletor-nota">+{{ totalBloqueadas }} via perfil</span>
      <span class="seletor-seta" aria-hidden="true">▾</span>
    </div>

    <div v-show="aberto" class="seletor-lista">
      <div class="seletor-topo">
        <input
          v-model="termo"
          class="seletor-busca"
          type="search"
          :placeholder="rotuloBusca"
          :aria-label="rotuloBusca"
        />
        <button v-if="selecionadas.length" type="button" class="seletor-limpar" @click="limpar">Limpar</button>
      </div>
      <p v-if="!opcoesFiltradas.length" class="seletor-vazio">Nada encontrado.</p>
      <label
        v-for="opcao in opcoesFiltradas"
        :key="opcao.valor"
        class="seletor-opcao"
        :class="{ 'seletor-opcao--bloqueada': opcao.bloqueado }"
      >
        <input v-if="opcao.bloqueado" type="checkbox" checked disabled />
        <input
          v-else
          type="checkbox"
          :value="opcao.valor"
          :checked="modelValue.includes(opcao.valor)"
          @change="alternar(opcao.valor, $event.target.checked)"
        />
        <span class="seletor-texto">
          <span class="seletor-rotulo">
            {{ opcao.rotulo }}
            <span v-if="opcao.nota" class="seletor-nota-opcao">{{ opcao.nota }}</span>
          </span>
          <span v-if="opcao.descricao" class="seletor-descricao">{{ opcao.descricao }}</span>
        </span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.seletor {
  position: relative;
  width: 100%;
}

.seletor-caixa {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.5rem;
  padding: 0.35rem 2rem 0.35rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
}

.seletor--aberto .seletor-caixa,
.seletor-caixa:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
  outline: none;
}

.seletor-etiqueta {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.3rem 0.2rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 6px;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.seletor-remover {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.7rem;
  cursor: pointer;
  padding: 0 0.2rem;
  line-height: 1;
}

.seletor-placeholder {
  color: #94a3b8;
  font-size: 0.86rem;
  padding-left: 0.3rem;
}

.seletor-nota {
  font-size: 0.74rem;
  font-weight: 700;
  color: #0369a1;
}

.seletor-seta {
  position: absolute;
  right: 0.7rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 0.8rem;
}

.seletor-lista {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 18rem;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 12px 24px -8px rgba(15, 23, 42, 0.25);
}

.seletor-topo {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}

.seletor-busca {
  flex: 1;
  padding: 0.45rem 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.82rem;
  outline: none;
  color: #1e293b;
  background: #ffffff;
}

.seletor-busca:focus {
  border-color: #15803d;
}

.seletor-limpar {
  border: none;
  background: transparent;
  color: #dc2626;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.seletor-vazio {
  margin: 0;
  padding: 0.75rem;
  font-size: 0.82rem;
  color: #64748b;
}

.seletor-opcao {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid #f8fafc;
}

.seletor-opcao:hover {
  background: #f8fafc;
}

.seletor-opcao input {
  margin-top: 0.2rem;
}

.seletor-opcao--bloqueada {
  cursor: default;
  opacity: 0.75;
}

.seletor-texto {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.seletor-rotulo {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
}

.seletor-nota-opcao {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #0369a1;
}

.seletor-descricao {
  font-size: 0.76rem;
  color: #64748b;
}

/* Tema escuro (LIZARDS-38) */
:root[data-tema="escuro"] .seletor-caixa,
:root[data-tema="escuro"] .seletor-lista {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .seletor--aberto .seletor-caixa,
:root[data-tema="escuro"] .seletor-caixa:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .seletor-etiqueta {
  background: var(--tenue-info);
  color: var(--cor-info);
  border-color: rgb(124 180 247 / 30%);
}

:root[data-tema="escuro"] .seletor-placeholder,
:root[data-tema="escuro"] .seletor-seta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .seletor-nota,
:root[data-tema="escuro"] .seletor-nota-opcao {
  color: var(--cor-info);
}

:root[data-tema="escuro"] .seletor-topo,
:root[data-tema="escuro"] .seletor-busca {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .seletor-topo,
:root[data-tema="escuro"] .seletor-opcao {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .seletor-busca {
  border-color: var(--cor-borda-forte);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .seletor-busca:focus {
  border-color: var(--cor-primaria);
}

:root[data-tema="escuro"] .seletor-limpar {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .seletor-opcao:hover {
  background: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .seletor-rotulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .seletor-descricao,
:root[data-tema="escuro"] .seletor-vazio {
  color: var(--cor-texto-terciario);
}
</style>

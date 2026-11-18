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

<style scoped src="../styles/components/SeletorMultiplo.css"></style>

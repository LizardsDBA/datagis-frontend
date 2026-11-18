<script setup>
/**
 * Campo de pesquisa da barra lateral: acha tela pelo título e botão pelo rótulo (só o que o
 * usuário tem permissão de ver) e leva até eles. Escolher um botão abre a tela dele e
 * destaca o botão. Cada resultado mostra o ícone da tela (o do botão é o da tela onde ele
 * fica). Teclado: ↑/↓ escolhem, Enter abre, Esc limpa.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { destacarNaTela, pesquisar } from '../navegacao/pesquisa'
import IconeTela from './IconeTela.vue'

const emit = defineEmits(['navegou'])

const router = useRouter()
const termo = ref('')
const indiceAtivo = ref(0)
const focado = ref(false)

const resultados = computed(() => pesquisar(termo.value))
const listaAberta = computed(() => focado.value && termo.value.trim().length > 0)

function aoDigitar() {
  indiceAtivo.value = 0
}

function mover(passo) {
  const total = resultados.value.length
  if (!total) return
  indiceAtivo.value = (indiceAtivo.value + passo + total) % total
}

async function abrir(resultado) {
  if (!resultado) return
  termo.value = ''
  focado.value = false
  emit('navegou')
  await router.push(resultado.rota)
  if (resultado.tipo === 'botao') {
    destacarNaTela(resultado.botao)
  }
}

function limpar() {
  termo.value = ''
}

// O clique num resultado acontece depois do blur; um atraso curto deixa o clique chegar.
function aoSair() {
  setTimeout(() => {
    focado.value = false
  }, 150)
}
</script>

<template>
  <div class="pesquisa" role="search">
    <svg class="pesquisa-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input
      v-model="termo"
      class="pesquisa-campo"
      type="search"
      placeholder="Pesquisar tela ou botão"
      aria-label="Pesquisar tela ou botão"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="listaAberta"
      aria-controls="pesquisa-resultados"
      @input="aoDigitar"
      @focus="focado = true"
      @blur="aoSair"
      @keydown.down.prevent="mover(1)"
      @keydown.up.prevent="mover(-1)"
      @keydown.enter.prevent="abrir(resultados[indiceAtivo])"
      @keydown.esc.prevent="limpar"
    />

    <ul v-if="listaAberta" id="pesquisa-resultados" class="pesquisa-lista" role="listbox">
      <li v-if="!resultados.length" class="pesquisa-vazio">Nada encontrado.</li>
      <li
        v-for="(resultado, i) in resultados"
        :key="`${resultado.tipo}-${resultado.rota}-${resultado.titulo}`"
        class="pesquisa-item"
        :class="{ 'pesquisa-item--ativo': i === indiceAtivo }"
        role="option"
        :aria-selected="i === indiceAtivo"
        @mousedown.prevent="abrir(resultado)"
        @mouseenter="indiceAtivo = i"
      >
        <span class="pesquisa-icone-tela" :style="{ background: resultado.cor }">
          <IconeTela :nome="resultado.icone" />
        </span>
        <span class="pesquisa-textos">
          <span class="pesquisa-titulo">{{ resultado.titulo }}</span>
          <span class="pesquisa-detalhe">
            <span class="pesquisa-tipo" :class="`pesquisa-tipo--${resultado.tipo}`">
              {{ resultado.tipo === 'tela' ? 'Tela' : 'Botão' }}
            </span>
            {{ resultado.tipo === 'botao' ? `em ${resultado.detalhe}` : resultado.detalhe }}
          </span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped src="../styles/components/PesquisaTelas.css"></style>

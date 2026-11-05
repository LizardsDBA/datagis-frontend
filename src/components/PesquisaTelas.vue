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

<style scoped>
.pesquisa {
  position: relative;
  margin: 0 0.75rem 0.75rem;
}

.pesquisa-icone {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  width: 0.95rem;
  height: 0.95rem;
  transform: translateY(-50%);
  color: var(--cor-slate-400);
  pointer-events: none;
}

.pesquisa-campo {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem 0.5rem 2rem;
  font-size: 0.82rem;
  color: var(--cor-slate-900);
  background: var(--cor-slate-50);
  border: 1px solid var(--cor-slate-200);
  border-radius: 8px;
  outline: none;
}

.pesquisa-campo:focus {
  border-color: var(--cor-primaria);
  background: var(--cor-branco);
}

.pesquisa-lista {
  position: absolute;
  z-index: 40;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  max-height: 22rem;
  overflow-y: auto;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  border-radius: 8px;
  box-shadow: var(--sombra-md);
}

.pesquisa-vazio {
  padding: 0.6rem;
  font-size: 0.8rem;
  color: var(--cor-slate-500);
}

.pesquisa-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.pesquisa-item--ativo {
  background: var(--cor-slate-100);
}

.pesquisa-icone-tela {
  flex-shrink: 0;
  display: inline-flex;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0.3rem;
  box-sizing: border-box;
  border-radius: 6px;
  color: #ffffff;
}

.pesquisa-tipo {
  margin-right: 0.2rem;
  padding: 0 0.3rem;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 4px;
}

.pesquisa-tipo--tela {
  background: var(--cor-primaria-clara);
  color: var(--cor-primaria);
}

.pesquisa-tipo--botao {
  background: var(--status-alerta-bg);
  color: var(--status-alerta-texto);
}

.pesquisa-textos {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pesquisa-titulo {
  line-height: 1.3;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--cor-slate-900);
}

.pesquisa-detalhe {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--cor-slate-500);
  /* no máximo 2 linhas: a barra lateral é estreita */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

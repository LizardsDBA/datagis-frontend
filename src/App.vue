<script setup>
import { ref } from 'vue'

// Tela minima da fatia 1 (CLAUDE.md §5.2): so dispara a ingestao e mostra o
// resultado. Sem login, sem roteamento - isso vem em fatias futuras.
const carregando = ref(false)
const resultado = ref(null)
const erro = ref(null)

async function ingerirCarPr() {
  carregando.value = true
  resultado.value = null
  erro.value = null
  try {
    const resposta = await fetch('/api/ingestao/car/pr', { method: 'POST' })
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`)
    }
    resultado.value = await resposta.json()
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}
</script>

<template>
  <main>
    <h1>DataGis</h1>
    <p>Fatia 1 — ingestão bruta do CAR (Paraná)</p>

    <button :disabled="carregando" @click="ingerirCarPr">
      {{ carregando ? 'Ingerindo...' : 'Ingerir CAR/PR' }}
    </button>

    <p v-if="resultado">
      Lote <strong>#{{ resultado.loteIngestaoId }}</strong> —
      {{ resultado.quantidadeRegistros }} registros gravados.
    </p>
    <p v-if="erro" style="color: crimson">Erro: {{ erro }}</p>
  </main>
</template>

<style scoped>
main {
  max-width: 40rem;
  margin: 3rem auto;
  font-family: sans-serif;
  text-align: center;
}
button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>

<script setup>
import { ref, onUnmounted } from 'vue'

// Tela minima da fatia 1 (CLAUDE.md §5.2): so dispara a ingestao e mostra o
// resultado. Sem login, sem roteamento - isso vem em fatias futuras.
const estado = ref('ocioso') // ocioso | carregando | sucesso | erro
const resultado = ref(null)
const erroMsg = ref(null)
const horarioResultado = ref(null)
const segundosDecorridos = ref(0)

let cronometro = null

function iniciarCronometro() {
  segundosDecorridos.value = 0
  cronometro = setInterval(() => {
    segundosDecorridos.value += 1
  }, 1000)
}

function pararCronometro() {
  clearInterval(cronometro)
  cronometro = null
}

async function ingerirCarPr() {
  estado.value = 'carregando'
  resultado.value = null
  erroMsg.value = null
  iniciarCronometro()

  try {
    const resposta = await fetch('/api/ingestao/car/pr', { method: 'POST' })
    if (!resposta.ok) {
      throw new Error(`O servidor respondeu HTTP ${resposta.status}`)
    }
    resultado.value = await resposta.json()
    horarioResultado.value = new Date().toLocaleTimeString('pt-BR')
    estado.value = 'sucesso'
  } catch (e) {
    erroMsg.value = e.message
    estado.value = 'erro'
  } finally {
    pararCronometro()
  }
}

onUnmounted(pararCronometro)
</script>

<template>
  <div class="pagina">
    <div class="cartao">
      <header class="cabecalho">
        <span class="marca">DataGis</span>
        <h1>Ingestão de dados — CAR (Paraná)</h1>
        <p class="subtitulo">
          Fatia 1: busca o perímetro dos imóveis rurais no WFS do SICAR e grava cada
          registro como está, sem tratar, na zona bruta.
        </p>
      </header>

      <button
        class="botao-principal"
        :disabled="estado === 'carregando'"
        @click="ingerirCarPr"
      >
        <span v-if="estado === 'carregando'" class="spinner" aria-hidden="true"></span>
        {{ estado === 'carregando' ? `Ingerindo… (${segundosDecorridos}s)` : 'Ingerir CAR/PR' }}
      </button>
      <p v-if="estado === 'carregando'" class="dica">
        Buscando no CAR e gravando registro a registro — pode levar de 10 a 20s.
      </p>

      <transition name="fade" mode="out-in">
        <div
          v-if="estado === 'sucesso' && resultado.status === 'SEM_MUDANCA'"
          key="sem-mudanca"
          class="resultado resultado--neutro"
        >
          <p class="resultado-titulo">Nada mudou desde a última vez</p>
          <p>
            O CAR/PR está igual ao lote anterior — nenhum registro novo foi gravado.
          </p>
          <dl>
            <div class="linha">
              <dt>Lote (verificação)</dt>
              <dd>#{{ resultado.loteIngestaoId }}</dd>
            </div>
            <div class="linha">
              <dt>Horário</dt>
              <dd>{{ horarioResultado }}</dd>
            </div>
          </dl>
        </div>

        <div v-else-if="estado === 'sucesso'" key="sucesso" class="resultado resultado--ok">
          <p class="resultado-titulo">Ingestão concluída</p>
          <dl>
            <div class="linha">
              <dt>Lote</dt>
              <dd>#{{ resultado.loteIngestaoId }}</dd>
            </div>
            <div class="linha">
              <dt>Registros gravados</dt>
              <dd>{{ resultado.quantidadeRegistros.toLocaleString('pt-BR') }}</dd>
            </div>
            <div class="linha">
              <dt>Horário</dt>
              <dd>{{ horarioResultado }}</dd>
            </div>
          </dl>
        </div>

        <div v-else-if="estado === 'erro'" key="erro" class="resultado resultado--erro">
          <p class="resultado-titulo">Falha na ingestão</p>
          <p>{{ erroMsg }}</p>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
:root {
  color-scheme: light;
}

.pagina {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f5f7;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  padding: 1.5rem;
  box-sizing: border-box;
}

.cartao {
  width: 100%;
  max-width: 30rem;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.06);
  padding: 2rem;
  box-sizing: border-box;
}

.cabecalho {
  text-align: center;
  margin-bottom: 1.75rem;
}

.marca {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e7d32;
  background: #e8f5e9;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  margin-bottom: 0.75rem;
}

.cabecalho h1 {
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
  color: #1a1a1a;
}

.subtitulo {
  font-size: 0.9rem;
  color: #666;
  margin: 0;
  line-height: 1.4;
}

.botao-principal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  background: #2e7d32;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.botao-principal:hover:not(:disabled) {
  background: #276b2b;
}

.botao-principal:disabled {
  cursor: default;
  opacity: 0.75;
}

.dica {
  text-align: center;
  font-size: 0.8rem;
  color: #888;
  margin: 0.6rem 0 0;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: girar 0.7s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}

.resultado {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border-radius: 8px;
  font-size: 0.9rem;
}

.resultado--ok {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
}

.resultado--neutro {
  background: #eef1f5;
  border: 1px solid #dde2e8;
  color: #444;
}

.resultado--erro {
  background: #fdecea;
  border: 1px solid #f5c6c2;
  color: #a12a22;
}

.resultado-titulo {
  font-weight: 700;
  margin: 0 0 0.6rem;
}

dl {
  margin: 0;
}

.linha {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
}

.linha dt {
  color: #555;
}

.linha dd {
  margin: 0;
  font-weight: 600;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

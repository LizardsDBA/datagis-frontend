<script setup>
import { ref, onMounted } from 'vue'

const fontes = ref([])
const carregandoLista = ref(false)
const enviando = ref(false)
const erro = ref(null)
const sucesso = ref(false)

const formVazio = () => ({
  nome: '',
  orgao: '',
  tipoAquisicao: 'UPLOAD_MANUAL',
  urlOrigem: '',
  formatoEsperado: '',
  ativo: true,
})

const form = ref(formVazio())

async function carregarFontes() {
  carregandoLista.value = true
  try {
    const resposta = await fetch('/api/fontes')
    fontes.value = await resposta.json()
  } catch (e) {
    erro.value = 'Não deu pra carregar a lista de fontes.'
  } finally {
    carregandoLista.value = false
  }
}

async function cadastrar() {
  enviando.value = true
  erro.value = null
  sucesso.value = false
  try {
    const resposta = await fetch('/api/fontes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null)
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    sucesso.value = true
    form.value = formVazio()
    await carregarFontes()
  } catch (e) {
    erro.value = e.message
  } finally {
    enviando.value = false
  }
}

onMounted(carregarFontes)
</script>

<template>
  <div>
    <form class="formulario" @submit.prevent="cadastrar">
      <label>
        Nome
        <input v-model="form.nome" required placeholder="Ex.: IBAMA - Embargos" />
      </label>
      <label>
        Órgão
        <input v-model="form.orgao" placeholder="Ex.: IBAMA" />
      </label>
      <label>
        Como os dados chegam
        <select v-model="form.tipoAquisicao">
          <option value="UPLOAD_MANUAL">Upload manual</option>
          <option value="API_REST">API</option>
          <option value="DOWNLOAD_URL">Download por URL</option>
        </select>
      </label>
      <label v-if="form.tipoAquisicao !== 'UPLOAD_MANUAL'">
        URL de origem
        <input v-model="form.urlOrigem" placeholder="https://..." />
      </label>
      <label>
        Formato esperado
        <select v-model="form.formatoEsperado">
          <option value="">-</option>
          <option value="CSV">CSV</option>
          <option value="GEOJSON">GeoJSON</option>
          <option value="SHAPEFILE">Shapefile</option>
          <option value="JSON">JSON</option>
        </select>
      </label>
      <label class="checkbox">
        <input v-model="form.ativo" type="checkbox" />
        Ativa
      </label>

      <button type="submit" class="botao-principal" :disabled="enviando">
        {{ enviando ? 'Cadastrando…' : 'Cadastrar fonte' }}
      </button>
      <p v-if="sucesso" class="mensagem-ok">Fonte cadastrada.</p>
      <p v-if="erro" class="mensagem-erro">{{ erro }}</p>
    </form>

    <h2 class="subtitulo-secao">Fontes cadastradas</h2>
    <p v-if="carregandoLista">Carregando…</p>
    <table v-else-if="fontes.length" class="tabela">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Órgão</th>
          <th>Tipo</th>
          <th>Ativa</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="fonte in fontes" :key="fonte.id">
          <td>{{ fonte.nome }}</td>
          <td>{{ fonte.orgao || '-' }}</td>
          <td>{{ fonte.tipoAquisicao }}</td>
          <td>{{ fonte.ativo ? 'Sim' : 'Não' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>Nenhuma fonte cadastrada ainda.</p>
  </div>
</template>

<style scoped>
.formulario {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #444;
}

label.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

input,
select {
  padding: 0.5rem;
  font-size: 0.9rem;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.botao-principal {
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  background: #2e7d32;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.botao-principal:disabled {
  opacity: 0.7;
  cursor: default;
}

.mensagem-ok {
  color: #2e7d32;
  font-size: 0.85rem;
}

.mensagem-erro {
  color: #a12a22;
  font-size: 0.85rem;
}

.subtitulo-secao {
  font-size: 1rem;
  margin: 0 0 0.75rem;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tabela th,
.tabela td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #eee;
}
</style>

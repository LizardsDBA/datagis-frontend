<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue'

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
  cronExpressao: '',
  formatoEsperado: '',
  ativo: true,
})

const form = ref(formVazio())

// Estado de execucao por fonte (chave = id) — mais de uma linha pode, em tese, estar
// rodando ao mesmo tempo, entao cada uma tem seu proprio estado/cronometro.
const execucoes = reactive({})

function estadoDe(id) {
  if (!execucoes[id]) {
    execucoes[id] = { estado: 'ocioso', resultado: null, erro: null, segundos: 0, cronometro: null }
  }
  return execucoes[id]
}

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

async function executar(fonte) {
  const est = estadoDe(fonte.id)
  est.estado = 'executando'
  est.resultado = null
  est.erro = null
  est.segundos = 0
  est.cronometro = setInterval(() => { est.segundos += 1 }, 1000)

  try {
    const resposta = await fetch(`/api/fontes/${fonte.id}/executar`, { method: 'POST' })
    const corpo = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      throw new Error(corpo?.erro || `O servidor respondeu HTTP ${resposta.status}`)
    }
    est.resultado = corpo
    est.estado = 'sucesso'
    await carregarFontes()
  } catch (e) {
    est.erro = e.message
    est.estado = 'erro'
  } finally {
    clearInterval(est.cronometro)
    est.cronometro = null
  }
}

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

onMounted(carregarFontes)
onUnmounted(() => {
  Object.values(execucoes).forEach((e) => e.cronometro && clearInterval(e.cronometro))
})
</script>

<template>
  <div>
    <p class="etiqueta">CADASTRO</p>
    <h1 class="titulo">Fontes de dados</h1>
    <p class="subtitulo">
      Fontes cadastradas e disparo manual de ingestão — cada fonte grava na zona bruta
      (schema-on-read), independente de qual seja.
    </p>

    <section class="cartao">
      <h2 class="cartao-titulo">Nova fonte</h2>
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
        <label>
          Expressão cron (agendamento futuro)
          <input v-model="form.cronExpressao" placeholder="Ex.: 0 0 3 * * ? (opcional por agora)" />
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
    </section>

    <section class="cartao">
      <h2 class="cartao-titulo">Fontes cadastradas</h2>
      <p v-if="carregandoLista">Carregando…</p>
      <p v-else-if="!fontes.length">Nenhuma fonte cadastrada ainda.</p>
      <div v-else class="tabela-scroll">
        <table class="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Órgão</th>
              <th>Tipo</th>
              <th>Formato</th>
              <th>Ativa</th>
              <th>Última execução</th>
              <th>Cadastrada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="fonte in fontes" :key="fonte.id">
              <tr>
                <td>{{ fonte.nome }}</td>
                <td>{{ fonte.orgao || '-' }}</td>
                <td>{{ fonte.tipoAquisicao }}</td>
                <td>{{ fonte.formatoEsperado || '-' }}</td>
                <td>
                  <span class="pill" :class="fonte.ativo ? 'pill--ok' : 'pill--neutro'">
                    {{ fonte.ativo ? 'Ativa' : 'Inativa' }}
                  </span>
                </td>
                <td>{{ formatarData(fonte.ultimaExecucaoEm) }}</td>
                <td>{{ formatarData(fonte.dataAdd) }}</td>
                <td>
                  <button
                    class="botao-play"
                    :disabled="estadoDe(fonte.id).estado === 'executando'"
                    :title="'Executar ingestão de ' + fonte.nome"
                    @click="executar(fonte)"
                  >
                    <span v-if="estadoDe(fonte.id).estado === 'executando'" class="spinner" aria-hidden="true"></span>
                    <svg v-else class="icone-play" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="estadoDe(fonte.id).estado !== 'ocioso'" class="linha-resultado">
                <td colspan="8">
                  <div v-if="estadoDe(fonte.id).estado === 'executando'" class="resultado resultado--neutro">
                    Executando… ({{ estadoDe(fonte.id).segundos }}s)
                  </div>
                  <div
                    v-else-if="estadoDe(fonte.id).estado === 'sucesso' && estadoDe(fonte.id).resultado.status === 'SEM_MUDANCA'"
                    class="resultado resultado--neutro"
                  >
                    Nada mudou desde a última vez — lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }}, sem registros novos.
                  </div>
                  <div v-else-if="estadoDe(fonte.id).estado === 'sucesso'" class="resultado resultado--ok">
                    Concluído — lote #{{ estadoDe(fonte.id).resultado.loteIngestaoId }},
                    {{ estadoDe(fonte.id).resultado.quantidadeRegistros.toLocaleString('pt-BR') }} registros gravados.
                  </div>
                  <div v-else-if="estadoDe(fonte.id).estado === 'erro'" class="resultado resultado--erro">
                    Falha: {{ estadoDe(fonte.id).erro }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.etiqueta {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e7d32;
}

.titulo {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
  color: #1a1a1a;
}

.subtitulo {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  color: #6b7280;
  max-width: 42rem;
}

.cartao {
  background: #fff;
  border: 1px solid #e6e8eb;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.cartao-titulo {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: #1a1a1a;
}

.formulario {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 26rem;
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
  font-family: inherit;
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

.tabela-scroll {
  overflow-x: auto;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tabela th,
.tabela td {
  text-align: left;
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
}

.pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.pill--ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.pill--neutro {
  background: #eef1f5;
  color: #667;
}

.botao-play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: #2e7d32;
  color: #fff;
  cursor: pointer;
}

.botao-play:disabled {
  opacity: 0.6;
  cursor: default;
}

.icone-play {
  width: 0.85rem;
  height: 0.85rem;
}

.spinner {
  width: 0.85rem;
  height: 0.85rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: girar 0.7s linear infinite;
}

@keyframes girar {
  to { transform: rotate(360deg); }
}

.linha-resultado td {
  padding: 0 0.6rem 0.6rem;
  border-bottom: 1px solid #eee;
}

.resultado {
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  font-size: 0.82rem;
}

.resultado--ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.resultado--neutro {
  background: #eef1f5;
  color: #556;
}

.resultado--erro {
  background: #fdecea;
  color: #a12a22;
}
</style>

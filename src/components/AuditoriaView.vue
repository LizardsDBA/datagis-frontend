<script setup>
/**
 * Logs de auditoria (LIZARDS-48): toda ação que alterou (ou tentou alterar) dado pela API —
 * quem, o quê, quando, de onde e com qual resultado. Somente leitura: o registro é
 * append-only no banco (RN025) e não há edição nem exclusão nesta tela.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { nomeDoPerfil } from '../auth/autenticacao'
import { buscarLogAuditoria } from '../services/auditoriaService'

const TAMANHO_PAGINA = 50

const filtros = reactive({ usuario: '', texto: '', metodo: '', sucesso: '', de: '', ate: '' })
const itens = ref([])
const total = ref(0)
const pagina = ref(0)
const carregando = ref(false)
const erro = ref('')

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / TAMANHO_PAGINA)))

async function carregar(novaPagina = 0) {
  carregando.value = true
  erro.value = ''
  try {
    const resposta = await buscarLogAuditoria({ ...filtros }, novaPagina, TAMANHO_PAGINA)
    itens.value = resposta.itens
    total.value = resposta.total
    pagina.value = novaPagina
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function limparFiltros() {
  Object.assign(filtros, { usuario: '', texto: '', metodo: '', sucesso: '', de: '', ate: '' })
  carregar(0)
}

function formatarDataHora(valor) {
  return new Date(valor).toLocaleString('pt-BR')
}

function descreverPerfis(perfis) {
  return perfis ? perfis.split(',').map(nomeDoPerfil).join(', ') : ''
}

function rotuloResultado(item) {
  if (item.sucesso) return 'Sucesso'
  if (item.statusHttp === 401) return 'Sem login'
  if (item.statusHttp === 403) return 'Acesso negado'
  return `Erro ${item.statusHttp}`
}

onMounted(() => carregar(0))
</script>

<template>
  <div class="pagina-auditoria">
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">RASTREABILIDADE</p>
        <h1 class="titulo">Logs de Auditoria</h1>
        <p class="subtitulo">
          Toda ação que alterou ou tentou alterar dados no sistema, inclusive as recusadas por falta de
          permissão. O histórico é somente leitura: não pode ser editado nem apagado.
        </p>
      </div>
      <button class="btn-secundario" :disabled="carregando" @click="carregar(pagina)">Atualizar</button>
    </header>

    <section class="card-secao">
      <form class="filtros" @submit.prevent="carregar(0)">
        <label class="campo">
          <span>Usuário</span>
          <input v-model.trim="filtros.usuario" class="campo-texto" placeholder="login" />
        </label>
        <label class="campo campo--largo">
          <span>Ação ou rota</span>
          <input v-model.trim="filtros.texto" class="campo-texto" placeholder="ex.: liberar lote" />
        </label>
        <label class="campo">
          <span>Método</span>
          <select v-model="filtros.metodo" class="campo-texto">
            <option value="">Todos</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
          </select>
        </label>
        <label class="campo">
          <span>Resultado</span>
          <select v-model="filtros.sucesso" class="campo-texto">
            <option value="">Todos</option>
            <option value="true">Sucesso</option>
            <option value="false">Falha ou negado</option>
          </select>
        </label>
        <label class="campo">
          <span>De</span>
          <input v-model="filtros.de" class="campo-texto" type="date" />
        </label>
        <label class="campo">
          <span>Até</span>
          <input v-model="filtros.ate" class="campo-texto" type="date" />
        </label>
        <div class="filtros-acoes">
          <button type="submit" class="btn-primario">Filtrar</button>
          <button type="button" class="btn-secundario" @click="limparFiltros">Limpar</button>
        </div>
      </form>

      <div v-if="erro" class="alerta alerta--erro">✕ {{ erro }}</div>
      <p v-else-if="carregando" class="estado-vazio">Carregando registros…</p>
      <p v-else-if="!itens.length" class="estado-vazio">Nenhum registro encontrado com esses filtros.</p>

      <template v-else>
        <p class="contagem">{{ total.toLocaleString('pt-BR') }} registro(s)</p>
        <div class="tabela-container">
          <table class="tabela-dados">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Resultado</th>
                <th>Duração</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in itens" :key="item.id">
                <td class="nowrap">{{ formatarDataHora(item.dataHora) }}</td>
                <td>
                  <div class="forte">{{ item.usuarioLogin || 'Sem login' }}</div>
                  <div class="detalhe">{{ descreverPerfis(item.perfis) }}</div>
                </td>
                <td>
                  <div class="forte">{{ item.acao }}</div>
                  <div class="detalhe">
                    <code>{{ item.metodo }} {{ item.rota }}</code>
                    <span v-if="item.parametros">?{{ item.parametros }}</span>
                  </div>
                </td>
                <td>
                  <span class="badge" :class="item.sucesso ? 'badge--ok' : 'badge--falha'">
                    {{ rotuloResultado(item) }}
                  </span>
                  <div class="detalhe">HTTP {{ item.statusHttp }}</div>
                </td>
                <td class="nowrap">{{ item.duracaoMs != null ? `${item.duracaoMs} ms` : '—' }}</td>
                <td class="nowrap detalhe">{{ item.ipOrigem || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="paginacao">
          <button class="btn-secundario" :disabled="pagina === 0 || carregando" @click="carregar(pagina - 1)">
            ← Anterior
          </button>
          <span>Página {{ pagina + 1 }} de {{ totalPaginas }}</span>
          <button
            class="btn-secundario"
            :disabled="pagina + 1 >= totalPaginas || carregando"
            @click="carregar(pagina + 1)"
          >
            Próxima →
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.pagina-auditoria {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.etiqueta {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #15803d;
}

.titulo {
  font-size: 1.65rem;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.subtitulo {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 48rem;
}

.card-secao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: flex-end;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  min-width: 9rem;
}

.campo--largo {
  min-width: 14rem;
  flex: 1;
}

.campo-texto {
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  color: #1e293b;
  background: #ffffff;
}

.campo-texto:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.filtros-acoes {
  display: flex;
  gap: 0.5rem;
}

.btn-primario,
.btn-secundario {
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
}

.btn-primario {
  background: #15803d;
  color: #ffffff;
  border: none;
}

.btn-secundario {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.alerta--erro {
  padding: 0.85rem 1.15rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.estado-vazio,
.contagem {
  color: #64748b;
  font-size: 0.86rem;
  margin: 0;
}

.tabela-container {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.8rem 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-dados td {
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}

.nowrap {
  white-space: nowrap;
}

.forte {
  font-weight: 700;
  color: #0f172a;
}

.detalhe {
  font-size: 0.76rem;
  color: #64748b;
  word-break: break-all;
}

.detalhe code {
  font-size: 0.74rem;
}

.badge {
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.badge--ok {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.badge--falha {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.paginacao {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.84rem;
  color: #475569;
}
/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .subtitulo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .card-secao {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .campo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo-texto {
  border-color: var(--cor-borda-forte);
  color: var(--cor-texto);
  background: var(--cor-superficie);
}

:root[data-tema="escuro"] .campo-texto:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .btn-primario {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-secundario {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .alerta--erro {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .estado-vazio,
:root[data-tema="escuro"] .contagem {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .tabela-container {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-dados th {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-rotulo);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-dados td {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .forte {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .detalhe {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .badge--ok {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .badge--falha {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .paginacao {
  color: var(--cor-texto-secundario);
}
</style>

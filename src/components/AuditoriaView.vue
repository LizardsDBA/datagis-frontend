<script setup>
/**
 * Logs de auditoria (LIZARDS-48): toda ação que alterou (ou tentou alterar) dado pela API —
 * quem, o quê, quando, de onde e com qual resultado. Somente leitura: o registro é
 * append-only no banco (RN025) e não há edição nem exclusão nesta tela.
 *
 * JSON: cada registro abre em JSON (ver e copiar) e o resultado inteiro do filtro aplicado
 * também pode ser visto de uma vez — a tela busca todas as páginas.
 *
 * Antes e depois: as ações que o backend audita com fotografia (V082, hoje as de usuário)
 * trazem dadosAntes/dadosDepois; a janela do registro mostra os dois lados com o que mudou
 * em vermelho. Registro antigo ou ação que é processo (ingestão, publicação) não tem.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { nomeDoPerfil, temPermissao } from '../auth/autenticacao'
import { PERMISSOES } from '../auth/permissoes'
import { buscarLogAuditoria } from '../services/auditoriaService'
import { buscarUsuarios } from '../services/usuarioService'

const TAMANHO_PAGINA = 50
// JSON do filtro inteiro: o backend devolve no máximo 200 por página
const TAMANHO_EXPORTACAO = 200
const LIMITE_EXPORTACAO = 10000

const filtros = reactive({ usuario: '', texto: '', metodo: '', sucesso: '', de: '', ate: '' })
const itens = ref([])
const total = ref(0)
const pagina = ref(0)
const carregando = ref(false)
const erro = ref('')

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / TAMANHO_PAGINA)))

// Filtros da última busca feita: o JSON do filtro usa estes, não o que está digitado e não filtrado
let filtrosAplicados = { ...filtros }

async function carregar(novaPagina = 0) {
  carregando.value = true
  erro.value = ''
  try {
    filtrosAplicados = { ...filtros }
    const resposta = await buscarLogAuditoria(filtrosAplicados, novaPagina, TAMANHO_PAGINA)
    itens.value = resposta.itens
    total.value = resposta.total
    pagina.value = novaPagina
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

// Ações sobre usuários trazem o id do Keycloak na rota (/api/admin/usuarios/{id}/...). Quem
// tem usuario:gerenciar vê o login no lugar; o Auditor (sem acesso à lista) continua vendo o id.
const loginPorId = ref({})
const ROTA_USUARIO = /^\/api\/admin\/usuarios\/([0-9a-f-]{36})/i

async function carregarLogins() {
  if (!temPermissao(PERMISSOES.USUARIO_GERENCIAR)) return
  try {
    const usuarios = await buscarUsuarios()
    loginPorId.value = Object.fromEntries(usuarios.map((u) => [u.id, u.login]))
  } catch {
    // Sem a lista, a tela segue mostrando só o id
  }
}

/** Login do usuário alterado pela ação, ou null quando a rota não é de usuário. */
function usuarioAlvo(item) {
  const id = item.rota?.match(ROTA_USUARIO)?.[1]
  if (!id) return null
  return { id, login: loginPorId.value[id] || null }
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

// ---------- JSON ----------
const jsonAberto = ref(null) // { titulo, conteudo }
const exportando = ref(false)
const progressoExportacao = ref('')
const copiado = ref(false)

/** Escapa o HTML e colore chave, texto, número e booleano/nulo. */
function realcarJson(texto) {
  const escapado = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escapado.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (trecho, texto, doisPontos, literal) => {
      if (texto) return doisPontos ? `<span class="json-chave">${texto}</span>${doisPontos}` : `<span class="json-texto">${texto}</span>`
      if (literal) return `<span class="json-literal">${literal}</span>`
      return `<span class="json-numero">${trecho}</span>`
    },
  )
}

const jsonRealcado = computed(() => (jsonAberto.value ? realcarJson(jsonAberto.value.conteudo) : ''))

// ---------- Antes e depois ----------
function lerJson(texto) {
  if (texto == null || texto === '') return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

/** Registro com o antes/depois como objeto (o backend manda como texto JSON). */
function normalizar(item) {
  return { ...item, dadosAntes: lerJson(item.dadosAntes), dadosDepois: lerJson(item.dadosDepois) }
}

const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** null quando a ação não tem antes/depois; senão os campos de cada lado e quais mudaram. */
function mudanca(item) {
  const antes = lerJson(item.dadosAntes)
  const depois = lerJson(item.dadosDepois)
  if (antes == null && depois == null) return null
  const chaves = [...new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])]
  const campos = chaves.map((chave) => ({
    chave,
    antes: antes ? antes[chave] : undefined,
    depois: depois ? depois[chave] : undefined,
    alterado: !iguais(antes?.[chave], depois?.[chave]),
  }))
  return {
    novo: antes == null,
    removido: depois == null,
    campos,
    alterados: campos.filter((c) => c.alterado).length,
  }
}

function resumoMudanca(item) {
  const m = mudanca(item)
  if (!m) return ''
  if (m.novo) return 'Cadastro novo'
  if (m.removido) return 'Registro removido'
  if (!m.alterados) return 'Nenhum campo mudou'
  return `${m.alterados} campo(s) alterado(s)`
}

/** Valor de um lado em uma linha de JSON, com cor (o texto é escapado em realcarJson). */
function valorRealcado(valor) {
  return valor === undefined ? '<span class="json-ausente">—</span>' : realcarJson(JSON.stringify(valor))
}

function verRegistro(item) {
  copiado.value = false
  jsonAberto.value = {
    titulo: `Registro #${item.id}`,
    conteudo: JSON.stringify(normalizar(item), null, 2),
    mudanca: mudanca(item),
  }
}

function filtrosPreenchidos() {
  return Object.fromEntries(Object.entries(filtrosAplicados).filter(([, valor]) => valor !== '' && valor != null))
}

/** Busca todas as páginas do filtro aplicado e monta o JSON com os metadados da consulta. */
async function montarJsonCompleto() {
  const registros = []
  let paginaAtual = 0
  let totalRegistros = 0
  do {
    const resposta = await buscarLogAuditoria(filtrosAplicados, paginaAtual, TAMANHO_EXPORTACAO)
    totalRegistros = resposta.total
    registros.push(...resposta.itens.map(normalizar))
    progressoExportacao.value = `${registros.length.toLocaleString('pt-BR')} de ${Math.min(totalRegistros, LIMITE_EXPORTACAO).toLocaleString('pt-BR')}`
    paginaAtual++
  } while (registros.length < totalRegistros && registros.length < LIMITE_EXPORTACAO && paginaAtual * TAMANHO_EXPORTACAO < totalRegistros)

  return JSON.stringify(
    {
      sistema: 'DataGIS',
      relatorio: 'Logs de Auditoria',
      geradoEm: new Date().toISOString(),
      filtros: filtrosPreenchidos(),
      totalEncontrado: totalRegistros,
      totalNoArquivo: registros.length,
      ...(totalRegistros > registros.length ? { aviso: `Limitado aos ${LIMITE_EXPORTACAO} registros mais recentes; refine os filtros.` } : {}),
      registros,
    },
    null,
    2,
  )
}

async function verFiltroEmJson() {
  exportando.value = true
  progressoExportacao.value = ''
  erro.value = ''
  try {
    const conteudo = await montarJsonCompleto()
    copiado.value = false
    jsonAberto.value = { titulo: 'Resultado do filtro', conteudo }
  } catch (e) {
    erro.value = `Não foi possível montar o JSON: ${e.message}`
  } finally {
    exportando.value = false
  }
}

async function copiarAberto() {
  try {
    await navigator.clipboard.writeText(jsonAberto.value.conteudo)
    copiado.value = true
  } catch {
    erro.value = 'O navegador não deixou copiar; selecione o texto e copie com Ctrl+C.'
  }
}

function fecharJson() {
  jsonAberto.value = null
}

function aoPressionarTecla(evento) {
  if (evento.key === 'Escape') fecharJson()
}

onMounted(() => {
  carregar(0)
  carregarLogins()
  window.addEventListener('keydown', aoPressionarTecla)
})

onUnmounted(() => {
  window.removeEventListener('keydown', aoPressionarTecla)
})
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
      <div class="acoes-topo">
        <button
          class="btn-secundario"
          :disabled="carregando || exportando || !total"
          :title="`Ver os ${total.toLocaleString('pt-BR')} registro(s) do filtro em JSON`"
          @click="verFiltroEmJson"
        >
          {{ exportando ? `Montando ${progressoExportacao}…` : 'Ver JSON do filtro' }}
        </button>
        <button class="btn-secundario" :disabled="carregando" @click="carregar(pagina)">Atualizar</button>
      </div>
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
                <th class="col-json">JSON</th>
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
                  <span v-if="resumoMudanca(item)" class="badge-mudanca">{{ resumoMudanca(item) }}</span>
                  <div v-if="usuarioAlvo(item)" class="usuario-alvo">
                    Usuário alterado:
                    <strong v-if="usuarioAlvo(item).login">{{ usuarioAlvo(item).login }}</strong>
                    <span v-else class="detalhe">não está mais na lista (ID {{ usuarioAlvo(item).id }})</span>
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
                <td class="col-json">
                  <button
                    type="button"
                    class="btn-json"
                    :title="`Ver o registro #${item.id} em JSON`"
                    :aria-label="`Ver o registro ${item.id} em JSON`"
                    @click="verRegistro(item)"
                  >
                    { }
                  </button>
                </td>
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

    <div v-if="jsonAberto" class="json-fundo" @click.self="fecharJson">
      <div class="json-janela" role="dialog" :aria-label="jsonAberto.titulo">
        <header class="json-topo">
          <div>
            <span class="json-etiqueta">JSON</span>
            <h2 class="json-titulo">{{ jsonAberto.titulo }}</h2>
          </div>
          <div class="json-acoes">
            <button type="button" class="btn-secundario" @click="copiarAberto">
              {{ copiado ? '✓ Copiado' : 'Copiar' }}
            </button>
            <button type="button" class="json-fechar" aria-label="Fechar" @click="fecharJson">✕</button>
          </div>
        </header>
        <div class="json-rolagem">
          <section v-if="jsonAberto.mudanca" class="antes-depois">
            <h3 class="bloco-titulo">
              Antes e depois
              <span class="legenda-alterado">em vermelho: o que foi alterado</span>
            </h3>
            <div class="lados">
              <div class="lado">
                <span class="lado-titulo">Antes</span>
                <p v-if="jsonAberto.mudanca.novo" class="lado-vazio">Não existia — cadastro novo.</p>
                <div v-else class="lado-json">
                  <div>{</div>
                  <div
                    v-for="campo in jsonAberto.mudanca.campos"
                    :key="campo.chave"
                    class="linha-campo"
                    :class="{ 'linha-campo--alterada': campo.alterado }"
                  >
                    <!-- eslint-disable-next-line vue/no-v-html -- valor escapado em realcarJson -->
                    <span class="json-chave">"{{ campo.chave }}"</span>: <span v-html="valorRealcado(campo.antes)"></span>
                  </div>
                  <div>}</div>
                </div>
              </div>
              <div class="lado">
                <span class="lado-titulo">Depois</span>
                <p v-if="jsonAberto.mudanca.removido" class="lado-vazio">Registro removido.</p>
                <div v-else class="lado-json">
                  <div>{</div>
                  <div
                    v-for="campo in jsonAberto.mudanca.campos"
                    :key="campo.chave"
                    class="linha-campo"
                    :class="{ 'linha-campo--alterada': campo.alterado }"
                  >
                    <!-- eslint-disable-next-line vue/no-v-html -- valor escapado em realcarJson -->
                    <span class="json-chave">"{{ campo.chave }}"</span>: <span v-html="valorRealcado(campo.depois)"></span>
                  </div>
                  <div>}</div>
                </div>
              </div>
            </div>
          </section>
          <h3 v-if="jsonAberto.mudanca" class="bloco-titulo bloco-titulo--completo">Registro completo</h3>
          <!-- eslint-disable-next-line vue/no-v-html -- o texto é escapado em realcarJson antes de colorir -->
          <pre class="json-conteudo" v-html="jsonRealcado"></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- Usuário alterado e JSON (só variáveis do style.css: o tema escuro já vem junto) ---------- */
.usuario-alvo {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--cor-slate-600);
}

.usuario-alvo strong {
  color: var(--cor-primaria);
}

.acoes-topo {
  display: flex;
  gap: 0.6rem;
}

.col-json {
  width: 4rem;
  text-align: center;
}

.btn-json {
  white-space: nowrap;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  font-family: var(--fonte-mono);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--cor-branco);
  color: var(--cor-slate-700);
  border: 1px solid var(--cor-slate-300);
}

.btn-json:hover {
  border-color: var(--cor-primaria);
  color: var(--cor-primaria);
}

.json-fundo {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
}

.json-janela {
  width: 100%;
  max-width: 920px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-modal);
}

.json-topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--cor-slate-200);
  background: var(--cor-slate-50);
}

.json-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--cor-primaria);
}

.json-titulo {
  margin: 0.15rem 0 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.json-acoes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.json-fechar {
  border: none;
  background: transparent;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--cor-slate-400);
}

.json-rolagem {
  overflow: auto;
}

.antes-depois {
  padding: 1rem 1.25rem 0;
}

.bloco-titulo {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0 0 0.6rem;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cor-slate-500);
}

.bloco-titulo--completo {
  padding: 1rem 1.25rem 0;
  margin: 0;
}

.legenda-alterado {
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: var(--status-erro-texto);
}

.lados {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.lado {
  min-width: 0;
  border: 1px solid var(--cor-slate-200);
  border-radius: 8px;
  overflow: hidden;
}

.lado-titulo {
  display: block;
  padding: 0.4rem 0.75rem;
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--cor-slate-700);
  background: var(--cor-slate-50);
  border-bottom: 1px solid var(--cor-slate-200);
}

.lado-vazio {
  margin: 0;
  padding: 0.75rem;
  font-size: 0.82rem;
  font-style: italic;
  color: var(--cor-slate-500);
}

.lado-json {
  padding: 0.5rem 0;
  font-family: var(--fonte-mono);
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--cor-slate-700);
}

.lado-json > div {
  padding: 0 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.linha-campo {
  padding-left: 1.75rem !important;
}

.linha-campo--alterada {
  background: var(--status-erro-bg);
  box-shadow: inset 3px 0 0 var(--status-erro-texto);
}

.linha-campo--alterada,
.linha-campo--alterada :deep(span) {
  color: var(--status-erro-texto) !important;
  font-weight: 700;
}

.lado-json :deep(.json-ausente) {
  color: var(--cor-slate-400);
}

@media (max-width: 700px) {
  .lados {
    grid-template-columns: 1fr;
  }
}

.badge-mudanca {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--status-erro-bg);
  color: var(--status-erro-texto);
  border: 1px solid var(--status-erro-borda);
}

.json-conteudo {
  margin: 0;
  padding: 1rem 1.25rem;
  overflow: visible;
  font-family: var(--fonte-mono);
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--cor-slate-700);
  white-space: pre;
}

.json-conteudo :deep(.json-chave),
.lado-json .json-chave {
  color: var(--status-info-texto);
}

.json-conteudo :deep(.json-texto),
.lado-json :deep(.json-texto) {
  color: var(--status-sucesso-texto);
}

.json-conteudo :deep(.json-numero),
.lado-json :deep(.json-numero) {
  color: var(--status-espacial-texto);
}

.json-conteudo :deep(.json-literal),
.lado-json :deep(.json-literal) {
  color: var(--status-alerta-texto);
}

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

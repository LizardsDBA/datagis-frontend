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

// ---------- SELETOR DE DATA CUSTOMIZADO (LIZARDS-56) ----------
const calendarioAberto = ref(null) // 'de' | 'ate' | null
const dataExibidaNav = ref(new Date())

function abrirCalendario(campo) {
  calendarioAberto.value = calendarioAberto.value === campo ? null : campo
}

function fecharCalendarios() {
  calendarioAberto.value = null
}

const mesAnoFormatado = computed(() => {
  return dataExibidaNav.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
})

function navegarMes(delta) {
  const novaData = new Date(dataExibidaNav.value)
  novaData.setMonth(novaData.getMonth() + delta)
  dataExibidaNav.value = novaData
}

const diasDoMes = computed(() => {
  const ano = dataExibidaNav.value.getFullYear()
  const mes = dataExibidaNav.value.getMonth()
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  
  const dias = []
  for (let i = 0; i < primeiroDiaSemana; i++) {
    dias.push(null)
  }
  for (let d = 1; d <= ultimoDia; d++) {
    const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    dias.push({ dia: d, iso: dataStr })
  }
  return dias
})

function selecionarData(iso, campo) {
  filtros[campo] = iso
  fecharCalendarios()
}

function selecionarHoje(campo) {
  const hoje = new Date().toISOString().split('T')[0]
  filtros[campo] = hoje
  fecharCalendarios()
}

function formatarDataBR(iso) {
  if (!iso) return 'dd/mm/aaaa'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

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
  if (evento.key === 'Escape') {
    fecharJson()
    fecharCalendarios()
  }
}

onMounted(() => {
  carregar(0)
  carregarLogins()
  window.addEventListener('keydown', aoPressionarTecla)
  window.addEventListener('click', fecharCalendarios)
})

onUnmounted(() => {
  window.removeEventListener('keydown', aoPressionarTecla)
  window.removeEventListener('click', fecharCalendarios)
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

        <!-- Campo DE (Calendário Customizado) -->
<!-- Campo DE (Calendário Customizado) -->
        <div class="campo campo-datepicker">
          <span>De</span>
          <button 
            type="button" 
            class="campo-texto btn-datepicker" 
            @click.stop="abrirCalendario('de')"
          >
            <span :class="{ 'texto-vazio': !filtros.de }">{{ formatarDataBR(filtros.de) }}</span>
            <svg class="icone-calendario" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </button>

          <!-- Popover do Calendário DataGis (Adicionada classe --direita) -->
          <div v-if="calendarioAberto === 'de'" class="popover-calendario popover-calendario--direita" @click.stop>
            <div class="cal-cabecalho">
              <span class="cal-titulo">{{ mesAnoFormatado }}</span>
              <div class="cal-nav">
                <button type="button" @click="navegarMes(-1)">‹</button>
                <button type="button" @click="navegarMes(1)">›</button>
              </div>
            </div>
            <div class="cal-grid-dias-semana">
              <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
            </div>
            <div class="cal-grid-dias">
              <template v-for="(item, idx) in diasDoMes" :key="idx">
                <span v-if="!item" class="dia-vazio"></span>
                <button 
                  v-else 
                  type="button" 
                  class="btn-dia" 
                  :class="{ 'btn-dia--selecionado': filtros.de === item.iso }"
                  @click="selecionarData(item.iso, 'de')"
                >
                  {{ item.dia }}
                </button>
              </template>
            </div>
            <div class="cal-rodape">
              <button type="button" class="btn-cal-acao" @click="selecionarData('', 'de')">Limpar</button>
              <button type="button" class="btn-cal-acao btn-cal-acao--hoje" @click="selecionarHoje('de')">Hoje</button>
            </div>
          </div>
        </div>

        <!-- Campo ATÉ (Calendário Customizado) -->
        <div class="campo campo-datepicker">
          <span>Até</span>
          <button 
            type="button" 
            class="campo-texto btn-datepicker" 
            @click.stop="abrirCalendario('ate')"
          >
            <span :class="{ 'texto-vazio': !filtros.ate }">{{ formatarDataBR(filtros.ate) }}</span>
            <svg class="icone-calendario" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </button>

          <!-- Popover do Calendário DataGis -->
          <div v-if="calendarioAberto === 'ate'" class="popover-calendario" @click.stop>
            <div class="cal-cabecalho">
              <span class="cal-titulo">{{ mesAnoFormatado }}</span>
              <div class="cal-nav">
                <button type="button" @click="navegarMes(-1)">‹</button>
                <button type="button" @click="navegarMes(1)">›</button>
              </div>
            </div>
            <div class="cal-grid-dias-semana">
              <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
            </div>
            <div class="cal-grid-dias">
              <template v-for="(item, idx) in diasDoMes" :key="idx">
                <span v-if="!item" class="dia-vazio"></span>
                <button 
                  v-else 
                  type="button" 
                  class="btn-dia" 
                  :class="{ 'btn-dia--selecionado': filtros.ate === item.iso }"
                  @click="selecionarData(item.iso, 'ate')"
                >
                  {{ item.dia }}
                </button>
              </template>
            </div>
            <div class="cal-rodape">
              <button type="button" class="btn-cal-acao" @click="selecionarData('', 'ate')">Limpar</button>
              <button type="button" class="btn-cal-acao btn-cal-acao--hoje" @click="selecionarHoje('ate')">Hoje</button>
            </div>
          </div>
        </div>

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

<style scoped src="../styles/views/AuditoriaView.css"></style>

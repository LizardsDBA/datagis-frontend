<script setup>
/**
 * Administração de usuários e controle de acesso (LIZARDS-47 / LIZARDS-40).
 *
 * Perfis são pacotes de permissões; o usuário pode ter vários perfis e ainda permissões
 * avulsas. A tela mostra sempre as permissões EFETIVAS (perfis expandidos + avulsas), que
 * é exatamente o que o backend vai conferir.
 *
 * Duas telas no mesmo componente: a lista (busca, ordenação, paginação e detalhe expansível)
 * e o formulário de página inteira (novo/editar), com "Voltar à lista".
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { nomeDoPerfil, sessao } from '../auth/autenticacao'
import SeletorMultiplo from './SeletorMultiplo.vue'
import {
  atualizarUsuario,
  buscarCatalogoAcesso,
  buscarUsuarios,
  criarUsuario,
  definirRoles,
  redefinirSenha,
} from '../services/usuarioService'
import {
  baixarArquivo,
  gerarCsvExportacao,
  gerarCsvModelo,
  interpretarImportacao,
  nomeArquivoExportacao,
} from '../services/usuariosCsv'
import { gerarPdfUsuarios } from '../services/usuariosPdf'

const usuarios = ref([])
const catalogo = ref({ perfis: [], permissoes: [] })
const carregando = ref(false)
const salvando = ref(false)
const erro = ref('')
const sucesso = ref('')
let temporizadorSucesso = null

// --- FILTROS DE BUSCA, DROPDOWNS E LIMPEZA (TASK LIZARDS-40) ---
const busca = ref('')
const filtroPerfil = ref('TODOS')
const filtroStatus = ref('TODOS')

function limparFiltros() {
  busca.value = ''
  filtroPerfil.value = 'TODOS'
  filtroStatus.value = 'TODOS'
  pagina.value = 1
}

// Lista: ordenação, paginação e linha expandida (sprint-2)
const tamanhoPagina = ref(50)
const pagina = ref(1)
const ordenacao = reactive({ coluna: 'login', crescente: true })
const expandidos = ref(new Set())
const OPCOES_TAMANHO = [10, 25, 50, 100]
const COLUNAS = [
  { chave: 'login', rotulo: 'Login' },
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'sobrenome', rotulo: 'Sobrenome' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'perfis', rotulo: 'Perfis' },
  { chave: 'ativo', rotulo: 'Ativo' },
]

// Formulário de cadastro/edição (página inteira)
const tela = ref('lista') // 'lista' | 'novo' | 'editar'
const erroForm = ref('')
const form = reactive({
  id: null,
  login: '',
  nome: '',
  sobrenome: '',
  email: '',
  senhaTemporaria: '',
  ativo: true,
  perfis: [],
  permissoesAvulsas: [],
})

// Modal de senha
const usuarioSenha = ref(null)
const novaSenha = ref('')
const erroSenha = ref('')

const descricaoPermissao = computed(() =>
  Object.fromEntries(catalogo.value.permissoes.map((p) => [p.codigo, p.descricao])),
)

/** Permissões que os perfis marcados no formulário já dão. */
const permissoesDosPerfis = computed(() => {
  const resultado = new Set()
  catalogo.value.perfis
    .filter((p) => form.perfis.includes(p.codigo))
    .forEach((p) => p.permissoes.forEach((codigo) => resultado.add(codigo)))
  return resultado
})

const permissoesEfetivasDoForm = computed(() =>
  catalogo.value.permissoes
    .map((p) => p.codigo)
    .filter((codigo) => permissoesDosPerfis.value.has(codigo) || form.permissoesAvulsas.includes(codigo)),
)

const opcoesPerfis = computed(() =>
  catalogo.value.perfis.map((p) => ({
    valor: p.codigo,
    rotulo: p.nome,
    descricao: `${p.descricao} · ${p.permissoes.length} permissões`,
  })),
)

const opcoesPermissoes = computed(() =>
  catalogo.value.permissoes.map((p) => {
    const viaPerfil = permissoesDosPerfis.value.has(p.codigo)
    return {
      valor: p.codigo,
      rotulo: p.codigo,
      descricao: p.descricao,
      bloqueado: viaPerfil,
      nota: viaPerfil ? 'via perfil' : '',
    }
  }),
)

const ehOProprioUsuario = (usuario) => usuario.login === sessao.login

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

function valorOrdenacao(usuario, coluna) {
  if (coluna === 'ativo') return usuario.ativo ? 0 : 1
  if (coluna === 'perfis') return usuario.perfis.map(nomeDoPerfil).join(', ')
  return normalizar(usuario[coluna])
}

// Computada unificada: Filtra por Texto (startsWith), Perfil, Status e Aplica Ordenação
const usuariosFiltrados = computed(() => {
  const termoTexto = normalizar(busca.value.trim())

  const filtrados = usuarios.value.filter((usuario) => {
    // 1. Filtro por Texto pelo COMEÇO das palavras/campos
    let bateuTexto = true
    if (termoTexto) {
      const nome = normalizar(usuario.nome)
      const sobrenome = normalizar(usuario.sobrenome)
      const login = normalizar(usuario.login)
      const email = normalizar(usuario.email)

      const bateuLogin = login.startsWith(termoTexto)
      const bateuEmail = email.startsWith(termoTexto)
      const bateuNome = nome.startsWith(termoTexto)
      const bateuSobrenome = sobrenome.startsWith(termoTexto)

      bateuTexto = bateuLogin || bateuEmail || bateuNome || bateuSobrenome
    }

    // 2. Filtro por Perfil / Tipo de Acesso
    let bateuPerfil = true
    if (filtroPerfil.value !== 'TODOS') {
      bateuPerfil =
        usuario.perfis &&
        usuario.perfis.some((p) => {
          const codigoUpper = String(p).toUpperCase()
          const perfilSelecionadoUpper = filtroPerfil.value.toUpperCase()
          return (
            codigoUpper === perfilSelecionadoUpper ||
            codigoUpper.includes(perfilSelecionadoUpper)
          )
        })
    }

    // 3. Filtro por Status (Ativo / Inativo)
    let bateuStatus = true
    if (filtroStatus.value === 'ATIVO') {
      bateuStatus = usuario.ativo === true
    } else if (filtroStatus.value === 'INATIVO') {
      bateuStatus = usuario.ativo === false
    }

    return bateuTexto && bateuPerfil && bateuStatus
  })

  // Aplica a ordenação
  const sinal = ordenacao.crescente ? 1 : -1
  return filtrados.sort((a, b) => {
    const va = valorOrdenacao(a, ordenacao.coluna)
    const vb = valorOrdenacao(b, ordenacao.coluna)
    return va < vb ? -sinal : va > vb ? sinal : 0
  })
})

const totalPaginas = computed(() => Math.max(1, Math.ceil(usuariosFiltrados.value.length / tamanhoPagina.value)))
const paginaAtual = computed(() => Math.min(pagina.value, totalPaginas.value))
const inicioPagina = computed(() => (paginaAtual.value - 1) * tamanhoPagina.value)
const usuariosDaPagina = computed(() =>
  usuariosFiltrados.value.slice(inicioPagina.value, inicioPagina.value + tamanhoPagina.value),
)

function ordenarPor(coluna) {
  if (ordenacao.coluna === coluna) {
    ordenacao.crescente = !ordenacao.crescente
  } else {
    ordenacao.coluna = coluna
    ordenacao.crescente = true
  }
}

function setaOrdenacao(coluna) {
  if (ordenacao.coluna !== coluna) return '↕'
  return ordenacao.crescente ? '▲' : '▼'
}

function alternarExpandido(id) {
  const novo = new Set(expandidos.value)
  if (novo.has(id)) novo.delete(id)
  else novo.add(id)
  expandidos.value = novo
}

const idCopiado = ref(null)

async function copiarId(usuario) {
  try {
    await navigator.clipboard.writeText(usuario.id)
    idCopiado.value = usuario.id
    setTimeout(() => {
      if (idCopiado.value === usuario.id) idCopiado.value = null
    }, 2000)
  } catch {
    erro.value = 'O navegador não deixou copiar; selecione o ID e copie com Ctrl+C.'
  }
}

function formatarData(valor) {
  if (!valor) return '—'
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR')
}

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const [lista, cat] = await Promise.all([buscarUsuarios(), buscarCatalogoAcesso()])
    usuarios.value = lista
    catalogo.value = cat
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function mostrarSucesso(mensagem) {
  sucesso.value = mensagem
  clearTimeout(temporizadorSucesso)
  temporizadorSucesso = setTimeout(() => (sucesso.value = ''), 4000)
}

function abrirNovo() {
  Object.assign(form, {
    id: null,
    login: '',
    nome: '',
    sobrenome: '',
    email: '',
    senhaTemporaria: '',
    ativo: true,
    perfis: [],
    permissoesAvulsas: [],
  })
  erroForm.value = ''
  tela.value = 'novo'
}

function abrirEdicao(usuario) {
  Object.assign(form, {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome || '',
    sobrenome: usuario.sobrenome || '',
    email: usuario.email || '',
    senhaTemporaria: '',
    ativo: usuario.ativo,
    perfis: [...usuario.perfis],
    permissoesAvulsas: [...usuario.permissoesAvulsas],
  })
  original = {
    dados: dadosDoForm(),
    roles: rolesDe(usuario.perfis, usuario.permissoesAvulsas),
  }
  erroForm.value = ''
  avisoForm.value = ''
  tela.value = 'editar'
}

function voltarALista() {
  tela.value = 'lista'
}

function fecharSenha() {
  usuarioSenha.value = null
}

function rolesDe(perfis, permissoesAvulsas) {
  const cobertas = new Set(
    catalogo.value.perfis.filter((p) => perfis.includes(p.codigo)).flatMap((p) => p.permissoes),
  )
  return [...perfis, ...permissoesAvulsas.filter((p) => !cobertas.has(p))]
}

function rolesDoForm() {
  return rolesDe(form.perfis, form.permissoesAvulsas)
}

function dadosDoForm() {
  return { nome: form.nome, sobrenome: form.sobrenome, email: form.email, ativo: form.ativo }
}

let original = null
const avisoForm = ref('')
const mesmoConjunto = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

async function salvar() {
  erroForm.value = ''
  avisoForm.value = ''
  const dados = dadosDoForm()
  const roles = rolesDoForm()
  const dadosMudaram = tela.value === 'editar' && JSON.stringify(dados) !== JSON.stringify(original.dados)
  const rolesMudaram = tela.value === 'editar' && !mesmoConjunto(roles, original.roles)
  if (tela.value === 'editar' && !dadosMudaram && !rolesMudaram) {
    avisoForm.value = 'Nenhuma alteração para salvar.'
    return
  }
  salvando.value = true
  try {
    if (tela.value === 'novo') {
      await criarUsuario({
        login: form.login,
        nome: form.nome,
        sobrenome: form.sobrenome,
        email: form.email,
        senhaTemporaria: form.senhaTemporaria,
        roles: rolesDoForm(),
      })
      mostrarSucesso(`Usuário ${form.login} cadastrado. Ele vai trocar a senha no primeiro acesso.`)
    } else {
      if (dadosMudaram) await atualizarUsuario(form.id, dados)
      if (rolesMudaram) await definirRoles(form.id, roles)
      mostrarSucesso(`Acessos de ${form.login} atualizados.`)
    }
    voltarALista()
    await carregar()
  } catch (e) {
    erroForm.value = e.message
  } finally {
    salvando.value = false
  }
}

const usuarioConfirmar = ref(null)
const alterandoAtivo = ref(false)
const botaoCancelarConfirmacao = ref(null)

async function alternarAtivo(usuario) {
  usuarioConfirmar.value = usuario
  await nextTick()
  botaoCancelarConfirmacao.value?.focus()
}

function fecharConfirmacao() {
  if (!alterandoAtivo.value) usuarioConfirmar.value = null
}

async function confirmarAlternarAtivo() {
  const usuario = usuarioConfirmar.value
  alterandoAtivo.value = true
  erro.value = ''
  try {
    await atualizarUsuario(usuario.id, {
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      email: usuario.email,
      ativo: !usuario.ativo,
    })
    mostrarSucesso(`Usuário ${usuario.login} ${usuario.ativo ? 'desativado' : 'reativado'}.`)
    await carregar()
  } catch (e) {
    erro.value = e.message
  } finally {
    alterandoAtivo.value = false
    usuarioConfirmar.value = null
  }
}

function abrirSenha(usuario) {
  usuarioSenha.value = usuario
  novaSenha.value = ''
  erroSenha.value = ''
}

async function salvarSenha() {
  salvando.value = true
  erroSenha.value = ''
  try {
    await redefinirSenha(usuarioSenha.value.id, novaSenha.value)
    mostrarSucesso(`Senha temporária definida para ${usuarioSenha.value.login}.`)
    fecharSenha()
  } catch (e) {
    erroSenha.value = e.message
  } finally {
    salvando.value = false
  }
}

const menuExportarAberto = ref(false)
const exportando = ref(false)
const menuExportar = ref(null)

function exportarCsv() {
  menuExportarAberto.value = false
  baixarArquivo(gerarCsvExportacao(usuariosFiltrados.value, nomeDoPerfil), nomeArquivoExportacao('csv'))
}

async function exportarPdf() {
  menuExportarAberto.value = false
  exportando.value = true
  erro.value = ''
  try {
    const doc = await gerarPdfUsuarios(usuariosFiltrados.value, nomeDoPerfil)
    doc.save(nomeArquivoExportacao('pdf'))
  } catch (e) {
    erro.value = `Não foi possível gerar o PDF: ${e.message}`
  } finally {
    exportando.value = false
  }
}

function aoClicarForaDoMenu(evento) {
  if (menuExportar.value && !menuExportar.value.contains(evento.target)) menuExportarAberto.value = false
}

function baixarModelo() {
  baixarArquivo(gerarCsvModelo(), 'modelo-importacao-usuarios.csv')
}

const importacaoAberta = ref(false)
const importando = ref(false)
const nomeArquivoImportacao = ref('')
const erroArquivoImportacao = ref('')
const linhasImportacao = ref([])
const resultadosImportacao = ref({})
const progressoImportacao = ref(0)

const linhasValidas = computed(() => linhasImportacao.value.filter((l) => !l.erros.length))
const importacaoConcluida = computed(() => Object.keys(resultadosImportacao.value).length > 0 && !importando.value)
const totalImportados = computed(() => Object.values(resultadosImportacao.value).filter((r) => r.ok).length)

function abrirImportacao() {
  importacaoAberta.value = true
  nomeArquivoImportacao.value = ''
  erroArquivoImportacao.value = ''
  linhasImportacao.value = []
  resultadosImportacao.value = {}
  progressoImportacao.value = 0
}

function fecharImportacao() {
  if (importando.value) return
  importacaoAberta.value = false
}

async function aoEscolherArquivo(evento) {
  const arquivo = evento.target.files?.[0]
  resultadosImportacao.value = {}
  linhasImportacao.value = []
  erroArquivoImportacao.value = ''
  if (!arquivo) return
  nomeArquivoImportacao.value = arquivo.name
  try {
    const { erroArquivo, linhas } = interpretarImportacao(
      await arquivo.text(),
      catalogo.value,
      usuarios.value.map((u) => u.login),
    )
    erroArquivoImportacao.value = erroArquivo || ''
    linhasImportacao.value = linhas
  } catch {
    erroArquivoImportacao.value = 'Não foi possível ler o arquivo. Salve a planilha como CSV e tente de novo.'
  }
}

async function importarUsuarios() {
  const fila = linhasValidas.value
  if (!fila.length) return
  importando.value = true
  progressoImportacao.value = 0
  const resultados = {}
  for (const item of fila) {
    try {
      await criarUsuario(item.payload)
      resultados[item.linha] = { ok: true, mensagem: 'Cadastrado' }
    } catch (e) {
      resultados[item.linha] = { ok: false, mensagem: e.message }
    }
    progressoImportacao.value++
    resultadosImportacao.value = { ...resultados }
  }
  importando.value = false
  const ok = Object.values(resultados).filter((r) => r.ok).length
  if (ok) mostrarSucesso(`${ok} usuário(s) importado(s). Cada um troca a senha no primeiro acesso.`)
  await carregar()
}

function aoPressionarTecla(evento) {
  if (evento.key !== 'Escape') return
  menuExportarAberto.value = false
  fecharConfirmacao()
  fecharSenha()
  fecharImportacao()
}

onMounted(() => {
  carregar()
  window.addEventListener('keydown', aoPressionarTecla)
  document.addEventListener('mousedown', aoClicarForaDoMenu)
})

onUnmounted(() => {
  window.removeEventListener('keydown', aoPressionarTecla)
  document.removeEventListener('mousedown', aoClicarForaDoMenu)
  clearTimeout(temporizadorSucesso)
})
</script>

<template>
  <div class="pagina-usuarios">
    <router-link v-if="tela === 'lista'" to="/admin/controle-acesso" class="link-voltar">
      ← Controle de Acesso
    </router-link>
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">CONTROLE DE ACESSO</p>
        <h1 class="titulo">
          {{ tela === 'lista' ? 'Usuários' : tela === 'novo' ? 'Novo usuário' : 'Editar usuário' }}
        </h1>
        <p class="subtitulo">
          Cadastro de usuários e atribuição de perfis. Cada perfil é um pacote de permissões; permissões
          avulsas complementam o que o perfil não cobre.
        </p>
      </div>
      <div v-if="tela === 'lista'" class="acoes-topo">
        <div ref="menuExportar" class="menu-exportar">
          <button
            class="btn-secundario"
            :disabled="!usuariosFiltrados.length || exportando"
            aria-haspopup="menu"
            :aria-expanded="menuExportarAberto"
            @click="menuExportarAberto = !menuExportarAberto"
          >
            {{ exportando ? 'Gerando…' : 'Exportar ▾' }}
          </button>
          <div v-if="menuExportarAberto" class="menu-exportar-lista" role="menu">
            <button type="button" role="menuitem" @click="exportarCsv">
              <strong>CSV</strong>
              <span>Planilha (Excel, LibreOffice)</span>
            </button>
            <button type="button" role="menuitem" @click="exportarPdf">
              <strong>PDF</strong>
              <span>Relatório para imprimir ou enviar</span>
            </button>
          </div>
        </div>
        <button class="btn-secundario" :disabled="carregando" @click="abrirImportacao">
          Importação em Massa de Usuário
        </button>
        <button class="btn-primario" @click="abrirNovo">+ Novo usuário</button>
      </div>
    </header>

    <div v-if="erro" class="alerta alerta--erro">✕ {{ erro }}</div>
    <div v-if="sucesso" class="alerta alerta--sucesso">✓ {{ sucesso }}</div>

    <!-- Lista -->
    <section v-if="tela === 'lista'" class="card-secao">
      <!-- BARRA DE LISTA E FILTROS EM TEMPO REAL (TASK LIZARDS-40) -->
      <div class="barra-lista">
        <label class="controle-tamanho">
          Mostrar
          <select v-model.number="tamanhoPagina" class="campo-select" aria-label="Registros por página" @change="pagina = 1">
            <option v-for="n in OPCOES_TAMANHO" :key="n" :value="n">{{ n }}</option>
          </select>
          registros
        </label>

        <form class="barra-busca" @submit.prevent>
          <input
            v-model="busca"
            class="campo-texto"
            type="search"
            placeholder="Buscar por login, nome ou e-mail"
            aria-label="Buscar usuário"
            @input="pagina = 1"
          />

          <!-- Filtro por Perfil -->
          <select v-model="filtroPerfil" class="seletor-filtro" aria-label="Filtrar por Perfil" @change="pagina = 1">
            <option value="TODOS">Todos os Perfis</option>
            <option value="ADMINISTRADOR">Administrador</option>
            <option value="ANALISTA">Analista</option>
            <option value="AUDITOR">Auditor</option>
            <option value="OPERADOR">Operador</option>
          </select>

          <!-- Filtro por Status -->
          <select v-model="filtroStatus" class="seletor-filtro" aria-label="Filtrar por Status" @change="pagina = 1">
            <option value="TODOS">Todos os Status</option>
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
          </select>

          <!-- Botão de Limpar -->
          <button
            v-if="busca || filtroPerfil !== 'TODOS' || filtroStatus !== 'TODOS'"
            type="button"
            class="btn-limpar-filtros"
            @click="limparFiltros"
          >
            Limpar
          </button>
        </form>
      </div>

      <p v-if="carregando" class="estado-vazio">Carregando usuários…</p>
      <p v-else-if="!usuariosFiltrados.length" class="estado-vazio">Nenhum usuário encontrado para os parâmetros informados.</p>

      <div v-else class="tabela-container">
        <table class="tabela-dados">
          <thead>
            <tr>
              <th class="col-expandir" aria-label="Detalhes"></th>
              <th v-for="coluna in COLUNAS" :key="coluna.chave" class="col-ordenavel" @click="ordenarPor(coluna.chave)">
                {{ coluna.rotulo }}
                <span class="seta-ordem" :class="{ 'seta-ordem--ativa': ordenacao.coluna === coluna.chave }">
                  {{ setaOrdenacao(coluna.chave) }}
                </span>
              </th>
              <th class="col-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="usuario in usuariosDaPagina" :key="usuario.id">
              <tr class="linha-usuario" :class="{ 'linha-usuario--aberta': expandidos.has(usuario.id) }" @click="alternarExpandido(usuario.id)">
                <td class="col-expandir">
                  <span class="icone-expandir" aria-hidden="true">{{ expandidos.has(usuario.id) ? '−' : '+' }}</span>
                </td>
                <td class="usuario-nome">{{ usuario.login }}</td>
                <td>{{ usuario.nome || '—' }}</td>
                <td>{{ usuario.sobrenome || '—' }}</td>
                <td>{{ usuario.email || '—' }}</td>
                <td>
                  <span v-for="perfil in usuario.perfis" :key="perfil" class="badge badge--perfil">
                    {{ nomeDoPerfil(perfil) }}
                  </span>
                  <span v-if="!usuario.perfis.length" class="texto-fraco">Nenhum</span>
                </td>
                <td>
                  <span
                    class="icone-status"
                    :class="usuario.ativo ? 'icone-status--ativo' : 'icone-status--inativo'"
                    :title="usuario.ativo ? 'Ativo' : 'Inativo'"
                    :aria-label="usuario.ativo ? 'Ativo' : 'Inativo'"
                  >
                    <svg v-if="usuario.ativo" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                    </svg>
                  </span>
                </td>
                <td class="col-acoes" @click.stop>
                  <button class="btn-icone" title="Editar" aria-label="Editar" @click="abrirEdicao(usuario)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                  </button>
                  <button class="btn-icone" title="Redefinir senha" aria-label="Redefinir senha" @click="abrirSenha(usuario)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></svg>
                  </button>
                  <button
                    class="btn-icone"
                    :class="usuario.ativo ? 'btn-icone--perigo' : 'btn-icone--sucesso'"
                    :disabled="ehOProprioUsuario(usuario)"
                    :title="
                      ehOProprioUsuario(usuario)
                        ? 'Você não pode desativar o seu próprio usuário'
                        : usuario.ativo
                          ? 'Desativar'
                          : 'Reativar'
                    "
                    :aria-label="usuario.ativo ? 'Desativar' : 'Reativar'"
                    @click="alternarAtivo(usuario)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0" /></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="expandidos.has(usuario.id)" class="linha-detalhe">
                <td :colspan="COLUNAS.length + 2">
                  <dl class="detalhe-usuario">
                    <dt>Perfis</dt>
                    <dd>
                      <span v-for="perfil in usuario.perfis" :key="perfil" class="badge badge--perfil">
                        {{ nomeDoPerfil(perfil) }}
                      </span>
                      <span v-if="!usuario.perfis.length" class="texto-fraco">Nenhum</span>
                    </dd>
                    <dt>Permissões avulsas</dt>
                    <dd>
                      <span
                        v-for="permissao in usuario.permissoesAvulsas"
                        :key="permissao"
                        class="badge badge--permissao"
                        :title="descricaoPermissao[permissao]"
                      >
                        {{ permissao }}
                      </span>
                      <span v-if="!usuario.permissoesAvulsas.length" class="texto-fraco">—</span>
                    </dd>
                    <dt>Permissões efetivas</dt>
                    <dd>
                      <span
                        v-for="permissao in usuario.permissoesEfetivas || []"
                        :key="permissao"
                        class="badge badge--permissao"
                        :title="descricaoPermissao[permissao]"
                      >
                        {{ permissao }}
                      </span>
                      <span v-if="!(usuario.permissoesEfetivas || []).length" class="texto-fraco">nenhuma</span>
                    </dd>
                    <dt>Situação</dt>
                    <dd>{{ usuario.ativo ? 'Ativo' : 'Inativo' }}</dd>
                    <dt>Inserção</dt>
                    <dd>{{ formatarData(usuario.criadoEm) }}</dd>
                    <dt>ID no Keycloak</dt>
                    <dd class="id-usuario">
                      <code>{{ usuario.id }}</code>
                      <button
                        type="button"
                        class="btn-copiar-id"
                        :aria-label="`Copiar o ID de ${usuario.login}`"
                        @click.stop="copiarId(usuario)"
                      >
                        {{ idCopiado === usuario.id ? '✓ Copiado' : 'Copiar' }}
                      </button>
                    </dd>
                  </dl>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <footer v-if="usuariosFiltrados.length" class="rodape-lista">
        <span class="texto-fraco">
          Mostrando {{ inicioPagina + 1 }} a {{ inicioPagina + usuariosDaPagina.length }} de
          {{ usuariosFiltrados.length }} registros
        </span>
        <div class="paginacao">
          <button class="btn-acao" :disabled="paginaAtual <= 1" @click="pagina = paginaAtual - 1">Anterior</button>
          <span class="pagina-numero">{{ paginaAtual }} / {{ totalPaginas }}</span>
          <button class="btn-acao" :disabled="paginaAtual >= totalPaginas" @click="pagina = paginaAtual + 1">
            Próxima
          </button>
        </div>
      </footer>
    </section>

    <!-- Cadastro / edição -->
    <form v-else class="card-secao formulario-usuario" @submit.prevent="salvar">
      <div v-if="erroForm" class="alerta alerta--erro">✕ {{ erroForm }}</div>
      <div v-if="avisoForm" class="alerta alerta--info" role="status">{{ avisoForm }}</div>

      <div class="linha-form">
        <label class="rotulo-form" for="campo-login">Login</label>
        <div class="campo-form">
          <template v-if="tela === 'novo'">
            <input
              id="campo-login"
              v-model.trim="form.login"
              class="campo-texto"
              required
              autocomplete="off"
              pattern="[A-Za-z0-9._@\-]+"
              title="Sem espaços nem acentos: letras, números, ponto, hífen, sublinhado ou @"
              placeholder="ex.: maria.silva"
            />
            <small>Sem espaços nem acentos (letras, números, . _ - @).</small>
          </template>
          <span v-else class="valor-fixo">{{ form.login }}</span>
        </div>
      </div>

      <div class="linha-form">
        <label class="rotulo-form" for="campo-nome">Nome</label>
        <div class="campo-form">
          <input id="campo-nome" v-model.trim="form.nome" class="campo-texto" required />
        </div>
      </div>

      <div class="linha-form">
        <label class="rotulo-form" for="campo-sobrenome">Sobrenome</label>
        <div class="campo-form">
          <input id="campo-sobrenome" v-model.trim="form.sobrenome" class="campo-texto" required />
        </div>
      </div>

      <div class="linha-form">
        <label class="rotulo-form" for="campo-email">E-mail</label>
        <div class="campo-form">
          <input id="campo-email" v-model.trim="form.email" class="campo-texto" type="email" required />
        </div>
      </div>

      <div v-if="tela === 'novo'" class="linha-form">
        <label class="rotulo-form" for="campo-senha">Senha temporária</label>
        <div class="campo-form">
          <input
            id="campo-senha"
            v-model="form.senhaTemporaria"
            class="campo-texto"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
          />
          <small>Mínimo 8 caracteres. O usuário troca no primeiro acesso.</small>
        </div>
      </div>

      <div class="linha-form">
        <span class="rotulo-form">Perfis</span>
        <div class="campo-form">
          <SeletorMultiplo v-model="form.perfis" :opcoes="opcoesPerfis" placeholder="Selecione um ou mais perfis" />
        </div>
      </div>

      <div class="linha-form">
        <span class="rotulo-form">Permissões avulsas</span>
        <div class="campo-form">
          <SeletorMultiplo
            v-model="form.permissoesAvulsas"
            :opcoes="opcoesPermissoes"
            placeholder="Só o que os perfis não cobrem"
          />
        </div>
      </div>

      <div class="linha-form">
        <span class="rotulo-form">Permissões efetivas</span>
        <div class="campo-form resumo-efetivas">
          <span v-if="!permissoesEfetivasDoForm.length" class="texto-fraco">
            Nenhuma — o usuário não verá nenhuma tela.
          </span>
          <span
            v-for="codigo in permissoesEfetivasDoForm"
            :key="codigo"
            class="badge badge--permissao"
            :title="descricaoPermissao[codigo]"
          >
            {{ codigo }}
          </span>
        </div>
      </div>

      <footer class="rodape-form">
        <button type="submit" class="btn-primario" :disabled="salvando">
          {{ salvando ? 'Salvando…' : 'Salvar' }}
        </button>
        <button type="button" class="btn-secundario" @click="voltarALista">Voltar à lista</button>
      </footer>
    </form>

    <!-- Importação em massa -->
    <div v-if="importacaoAberta" class="modal-backdrop" @click.self="fecharImportacao">
      <div class="modal-dialog modal-dialog--largo" role="dialog" aria-label="Importação em Massa de Usuário">
        <header class="modal-header">
          <div>
            <span class="modal-etiqueta">IMPORTAÇÃO EM MASSA</span>
            <h2 class="modal-titulo">Importação em Massa de Usuário</h2>
          </div>
          <button type="button" class="btn-fechar" aria-label="Fechar" :disabled="importando" @click="fecharImportacao">
            ✕
          </button>
        </header>
        <div class="modal-body">
          <ol class="passos-importacao">
            <li>
              Baixe o modelo e preencha um usuário por linha, sem mudar o cabeçalho.
              <button type="button" class="btn-acao" @click="baixarModelo">Baixar modelo (CSV)</button>
            </li>
            <li>
              Colunas obrigatórias: <code>login</code>, <code>nome</code>, <code>sobrenome</code>,
              <code>email</code> e <code>senha_temporaria</code> (mínimo 8 caracteres; o usuário troca no
              primeiro acesso). Em <code>perfis</code> e <code>permissoes_avulsas</code>, separe vários com
              vírgula. Perfis aceitos: {{ catalogo.perfis.map((p) => p.nome).join(', ') }}.
            </li>
            <li>Troque ou apague a linha de exemplo (<code>maria.silva</code>) antes de enviar.</li>
          </ol>

          <label class="campo-arquivo">
            <span class="btn-secundario">Escolher arquivo</span>
            <input type="file" accept=".csv,text/csv" :disabled="importando" @change="aoEscolherArquivo" />
            <span class="texto-fraco">{{ nomeArquivoImportacao || 'Nenhum arquivo escolhido' }}</span>
          </label>

          <div v-if="erroArquivoImportacao" class="alerta alerta--erro">✕ {{ erroArquivoImportacao }}</div>

          <template v-if="linhasImportacao.length">
            <p class="resumo-importacao">
              {{ linhasImportacao.length }} linha(s) no arquivo:
              <strong>{{ linhasValidas.length }} pronta(s)</strong>
              <template v-if="linhasImportacao.length - linhasValidas.length">
                e <strong class="texto-erro">{{ linhasImportacao.length - linhasValidas.length }} com erro</strong>,
                que não serão importadas.
              </template>
            </p>
            <div class="tabela-container tabela-importacao">
              <table class="tabela-dados">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Login</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfis</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in linhasImportacao" :key="item.linha">
                    <td>{{ item.linha }}</td>
                    <td class="usuario-nome">{{ item.login || '—' }}</td>
                    <td>{{ [item.nome, item.sobrenome].filter(Boolean).join(' ') || '—' }}</td>
                    <td>{{ item.email || '—' }}</td>
                    <td>{{ item.perfis.join(', ') || '—' }}</td>
                    <td class="situacao-importacao">
                      <span v-if="item.erros.length" class="texto-erro">{{ item.erros.join('; ') }}</span>
                      <span v-else-if="resultadosImportacao[item.linha]?.ok" class="texto-ok">✓ Cadastrado</span>
                      <span v-else-if="resultadosImportacao[item.linha]" class="texto-erro">
                        {{ resultadosImportacao[item.linha].mensagem }}
                      </span>
                      <span v-else class="texto-fraco">Pronto para importar</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
        <footer class="modal-footer">
          <span v-if="importando" class="texto-fraco progresso-importacao">
            Importando {{ progressoImportacao }} de {{ linhasValidas.length }}…
          </span>
          <span v-else-if="importacaoConcluida" class="texto-fraco progresso-importacao">
            {{ totalImportados }} de {{ linhasValidas.length }} importado(s).
          </span>
          <button type="button" class="btn-secundario" :disabled="importando" @click="fecharImportacao">
            {{ importacaoConcluida ? 'Fechar' : 'Cancelar' }}
          </button>
          <button
            v-if="!importacaoConcluida"
            type="button"
            class="btn-primario"
            :disabled="importando || !linhasValidas.length"
            @click="importarUsuarios"
          >
            {{ importando ? 'Importando…' : `Importar ${linhasValidas.length} usuário(s)` }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Confirmação de desativar/reativar -->
    <div v-if="usuarioConfirmar" class="modal-backdrop" @click.self="fecharConfirmacao">
      <div
        class="modal-dialog modal-confirmacao"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmacao"
        aria-describedby="texto-confirmacao"
      >
        <div class="confirmacao-corpo">
          <span
            class="confirmacao-icone"
            :class="usuarioConfirmar.ativo ? 'confirmacao-icone--perigo' : 'confirmacao-icone--sucesso'"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24"><path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0" /></svg>
          </span>
          <div>
            <h2 id="titulo-confirmacao" class="confirmacao-titulo">
              {{ usuarioConfirmar.ativo ? 'Desativar usuário?' : 'Reativar usuário?' }}
            </h2>
            <p class="confirmacao-usuario">
              <strong>{{ usuarioConfirmar.login }}</strong>
              <span v-if="usuarioConfirmar.nome || usuarioConfirmar.sobrenome">
                · {{ [usuarioConfirmar.nome, usuarioConfirmar.sobrenome].filter(Boolean).join(' ') }}
              </span>
              <span v-if="usuarioConfirmar.email"> · {{ usuarioConfirmar.email }}</span>
            </p>
            <ul id="texto-confirmacao" class="confirmacao-efeitos">
              <template v-if="usuarioConfirmar.ativo">
                <li>Deixa de conseguir entrar no DataGIS.</li>
                <li>Se estiver com o sistema aberto, perde o acesso quando a sessão atual expirar.</li>
                <li>Cadastro, perfis e histórico no log de auditoria continuam guardados.</li>
                <li>Pode ser reativado depois, a qualquer momento.</li>
              </template>
              <template v-else>
                <li>Volta a conseguir entrar no DataGIS, com a mesma senha.</li>
                <li>Recupera os mesmos perfis e permissões que tinha antes.</li>
              </template>
            </ul>
          </div>
        </div>
        <footer class="modal-footer">
          <button
            ref="botaoCancelarConfirmacao"
            type="button"
            class="btn-secundario"
            :disabled="alterandoAtivo"
            @click="fecharConfirmacao"
          >
            Cancelar
          </button>
          <button
            type="button"
            :class="usuarioConfirmar.ativo ? 'btn-perigo' : 'btn-primario'"
            :disabled="alterandoAtivo"
            @click="confirmarAlternarAtivo"
          >
            {{
              alterandoAtivo
                ? 'Salvando…'
                : usuarioConfirmar.ativo
                  ? 'Desativar usuário'
                  : 'Reativar usuário'
            }}
          </button>
        </footer>
      </div>
    </div>

    <!-- Senha temporária -->
    <div v-if="usuarioSenha" class="modal-backdrop" @click.self="fecharSenha">
      <form class="modal-dialog" @submit.prevent="salvarSenha">
        <header class="modal-header">
          <div>
            <span class="modal-etiqueta">REDEFINIR SENHA</span>
            <h2 class="modal-titulo">{{ usuarioSenha.login }}</h2>
          </div>
          <button type="button" class="btn-fechar" aria-label="Fechar" @click="fecharSenha">✕</button>
        </header>
        <div class="modal-body">
          <div v-if="erroSenha" class="alerta alerta--erro">✕ {{ erroSenha }}</div>
          <label class="campo">
            <span>Nova senha temporária</span>
            <input v-model="novaSenha" class="campo-texto" type="password" minlength="8" required autocomplete="new-password" />
            <small>O usuário será obrigado a trocá-la no próximo login.</small>
          </label>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn-secundario" @click="fecharSenha">Cancelar</button>
          <button type="submit" class="btn-primario" :disabled="salvando">Definir senha</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.pagina-usuarios {
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

.acoes-topo {
  display: flex;
  gap: 0.6rem;
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

.btn-primario:hover:not(:disabled) {
  background: #166534;
}

.btn-secundario {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-secundario:hover:not(:disabled) {
  background: #f8fafc;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.alerta {
  padding: 0.85rem 1.15rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
}

.alerta--erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--info {
  background: var(--status-info-bg);
  color: var(--status-info-texto);
  border: 1px solid var(--status-info-borda);
}

.alerta--sucesso {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
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

.barra-busca {
  display: flex;
  gap: 0.6rem;
  flex: 1;
  max-width: 42rem;
  flex-wrap: wrap;
  align-items: center;
}

.campo-texto,
.campo-select {
  box-sizing: border-box;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  color: #1e293b;
  background: #ffffff;
}

.campo-texto {
  flex: 2;
  min-width: 12rem;
}

.campo-select {
  padding: 0.45rem 0.6rem;
}

.campo-texto:focus,
.campo-select:focus,
.seletor-filtro:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.seletor-filtro {
  flex: 1;
  min-width: 9rem;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  background-color: #ffffff;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

.btn-limpar-filtros {
  background: transparent;
  border: 1px solid #fca5a5;
  color: #dc2626;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-limpar-filtros:hover {
  background: #fee2e2;
}

.estado-vazio {
  color: #64748b;
  font-size: 0.9rem;
}

.link-voltar {
  align-self: flex-start;
  margin-bottom: -0.75rem;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--cor-primaria);
  text-decoration: none;
}

.link-voltar:hover {
  text-decoration: underline;
}

/* Lista */
.barra-lista {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.controle-tamanho {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.84rem;
  color: #475569;
}

.tabela-container {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.85rem 1rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-dados td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.col-ordenavel {
  cursor: pointer;
  user-select: none;
}

.col-ordenavel:hover {
  color: #15803d;
}

.seta-ordem {
  margin-left: 0.25rem;
  font-size: 0.7rem;
  color: #cbd5e1;
}

.seta-ordem--ativa {
  color: #15803d;
}

.col-expandir {
  width: 2.5rem;
  text-align: center;
}

.linha-usuario {
  cursor: pointer;
}

.linha-usuario:hover td {
  background: #f8fafc;
}

.linha-usuario--aberta td {
  background: #f0fdf4;
  border-bottom-color: transparent;
}

.icone-expandir {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  font-size: 0.9rem;
  font-weight: 700;
  background: #15803d;
  color: #ffffff;
}

.linha-usuario--aberta .icone-expandir {
  background: #b91c1c;
}

.linha-detalhe td {
  background: #f0fdf4;
  padding: 0.25rem 1rem 1rem 3.5rem;
}

.detalhe-usuario {
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
  font-size: 0.84rem;
}

.detalhe-usuario dt {
  font-weight: 700;
  color: #334155;
}

.detalhe-usuario dd {
  margin: 0;
  color: #475569;
}

.id-usuario {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.id-usuario code {
  font-size: 0.8rem;
  user-select: all;
}

.btn-copiar-id {
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--cor-branco);
  color: var(--cor-slate-700);
  border: 1px solid var(--cor-slate-300);
}

.btn-copiar-id:hover {
  border-color: var(--cor-primaria);
  color: var(--cor-primaria);
}

.col-acoes {
  white-space: nowrap;
  text-align: right;
}

.usuario-nome {
  font-weight: 700;
  color: #0f172a;
}

.texto-fraco {
  color: #94a3b8;
  font-size: 0.8rem;
}

.icone-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
}

.icone-status svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icone-status--ativo {
  background: #dcfce7;
  color: #15803d;
}

.icone-status--inativo {
  background: #fee2e2;
  color: #b91c1c;
}

.badge {
  display: inline-flex;
  align-items: center;
  margin: 0.1rem 0.25rem 0.1rem 0;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.badge--perfil {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.badge--permissao {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}

.btn-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin-left: 0.3rem;
  border-radius: 6px;
  cursor: pointer;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-icone svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.btn-icone:hover:not(:disabled) {
  background: #f8fafc;
}

.btn-icone--perigo {
  color: #dc2626;
  border-color: #fecaca;
}

.btn-icone--perigo:hover:not(:disabled) {
  background: #fee2e2;
}

.btn-icone--sucesso {
  color: #15803d;
  border-color: #bbf7d0;
}

.btn-icone--sucesso:hover:not(:disabled) {
  background: #dcfce7;
}

.rodape-lista {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.paginacao {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pagina-numero {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}

.btn-acao {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-acao:hover:not(:disabled) {
  background: #f8fafc;
}

/* Formulário de página inteira */
.formulario-usuario {
  gap: 0;
  padding: 0.5rem 1.5rem 1.25rem;
}

.linha-form {
  display: grid;
  grid-template-columns: 13rem minmax(0, 40rem);
  align-items: start;
  gap: 1.25rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid #f1f5f9;
}

.rotulo-form {
  padding-top: 0.6rem;
  text-align: right;
  font-size: 0.86rem;
  font-weight: 700;
  color: #334155;
}

.campo-form {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.campo-form small {
  font-size: 0.76rem;
  color: #94a3b8;
}

.valor-fixo {
  padding-top: 0.6rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.resumo-efetivas {
  flex-direction: row;
  flex-wrap: wrap;
  padding-top: 0.45rem;
}

.rodape-form {
  display: flex;
  gap: 0.75rem;
  padding-top: 1.25rem;
  padding-left: 14.25rem;
}

/* Menu de exportação */
.menu-exportar {
  position: relative;
}

.menu-exportar-lista {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 30;
  min-width: 15rem;
  padding: 0.3rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 12px 24px -8px rgba(15, 23, 42, 0.25);
}

.menu-exportar-lista button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.menu-exportar-lista button:hover,
.menu-exportar-lista button:focus-visible {
  background: #f0fdf4;
  outline: none;
}

.menu-exportar-lista strong {
  font-size: 0.86rem;
  color: #0f172a;
}

.menu-exportar-lista span {
  font-size: 0.76rem;
  color: #64748b;
}

/* Importação em massa */
.modal-dialog.modal-dialog--largo {
  max-width: 900px;
}

.passos-importacao {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.86rem;
  color: #334155;
  line-height: 1.5;
}

.passos-importacao .btn-acao {
  margin-left: 0.5rem;
}

.passos-importacao code {
  font-size: 0.8rem;
}

.campo-arquivo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.campo-arquivo input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.campo-arquivo:focus-within .btn-secundario {
  outline: 2px solid #15803d;
  outline-offset: 2px;
}

.resumo-importacao {
  margin: 0;
  font-size: 0.86rem;
  color: #334155;
}

.tabela-importacao {
  max-height: 18rem;
  overflow-y: auto;
}

.situacao-importacao {
  font-size: 0.8rem;
}

.texto-erro {
  color: #b91c1c;
  font-weight: 600;
}

.texto-ok {
  color: #15803d;
  font-weight: 700;
}

.progresso-importacao {
  margin-right: auto;
  align-self: center;
}

/* Confirmação de desativar/reativar */
.modal-confirmacao {
  max-width: 480px;
}

.confirmacao-corpo {
  display: flex;
  gap: 1rem;
  padding: 1.5rem 1.5rem 1.25rem;
}

.confirmacao-icone {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
}

.confirmacao-icone svg {
  width: 1.4rem;
  height: 1.4rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.confirmacao-icone--perigo {
  background: var(--status-erro-bg);
  color: var(--status-erro-texto);
}

.confirmacao-icone--sucesso {
  background: var(--status-sucesso-bg);
  color: var(--status-sucesso-texto);
}

.confirmacao-titulo {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.confirmacao-usuario {
  margin: 0.3rem 0 0.75rem;
  font-size: 0.86rem;
  color: var(--cor-slate-500);
  word-break: break-word;
}

.confirmacao-usuario strong {
  color: var(--cor-slate-900);
}

.confirmacao-efeitos {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--cor-slate-700);
}

.btn-perigo {
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  background: var(--status-erro-texto);
  color: var(--cor-branco);
}

.btn-perigo:hover:not(:disabled) {
  filter: brightness(1.1);
}

/* Modal de senha */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #15803d;
}

.modal-titulo {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0.2rem 0 0;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  background: #fafbfc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}

.campo small {
  font-weight: 500;
  color: #94a3b8;
}

.grupo {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem 1rem 1rem;
  margin: 0;
}

.grupo legend {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 0.35rem;
}

.opcao {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.55rem 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}

.opcao:last-child {
  border-bottom: none;
}

.opcao input {
  margin-top: 0.2rem;
}

.opcao-desc {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
}

.opcao code {
  font-size: 0.8rem;
  color: #0f172a;
}

.via-perfil {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #0369a1;
}

@media (max-width: 760px) {
  .acoes-topo {
    width: 100%;
  }

  .barra-busca {
    max-width: none;
    width: 100%;
  }

  .linha-form {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .rotulo-form {
    text-align: left;
    padding-top: 0;
  }

  .rodape-form {
    padding-left: 0;
  }

  .detalhe-usuario {
    grid-template-columns: 1fr;
  }
}

/* ==========================================================================
   Tema escuro (LIZARDS-38)
   ========================================================================== */
:root[data-tema="escuro"] .seletor-filtro {
  border-color: var(--cor-borda-forte);
  background-color: var(--cor-superficie);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .seletor-filtro:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .btn-limpar-filtros {
  border-color: rgb(248 113 113 / 40%);
  color: var(--cor-erro);
  background: transparent;
}

:root[data-tema="escuro"] .btn-limpar-filtros:hover {
  background: var(--tenue-erro);
}

:root[data-tema="escuro"] .etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .subtitulo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-primario {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-primario:hover:not(:disabled) {
  background: var(--cor-primaria-hover);
}

:root[data-tema="escuro"] .btn-secundario,
:root[data-tema="escuro"] .btn-acao,
:root[data-tema="escuro"] .btn-icone {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-secundario:hover:not(:disabled),
:root[data-tema="escuro"] .btn-acao:hover:not(:disabled),
:root[data-tema="escuro"] .btn-icone:hover:not(:disabled) {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-icone--perigo {
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .btn-icone--perigo:hover:not(:disabled) {
  background: var(--tenue-erro);
}

:root[data-tema="escuro"] .btn-icone--sucesso {
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .btn-icone--sucesso:hover:not(:disabled) {
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .alerta--erro {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .alerta--sucesso {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .card-secao {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .campo-texto,
:root[data-tema="escuro"] .campo-select {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda-forte);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .campo-texto:focus,
:root[data-tema="escuro"] .campo-select:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .estado-vazio,
:root[data-tema="escuro"] .controle-tamanho {
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

:root[data-tema="escuro"] .col-ordenavel:hover,
:root[data-tema="escuro"] .seta-ordem--ativa {
  color: var(--cor-primaria);
}

:root[data-tema="escuro"] .seta-ordem {
  color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .linha-usuario:hover td {
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .linha-usuario--aberta td,
:root[data-tema="escuro"] .linha-detalhe td {
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .icone-expandir {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .linha-usuario--aberta .icone-expandir {
  background: var(--cor-erro);
}

:root[data-tema="escuro"] .detalhe-usuario dt,
:root[data-tema="escuro"] .rotulo-form,
:root[data-tema="escuro"] .pagina-numero,
:root[data-tema="escuro"] .campo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .detalhe-usuario dd {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .usuario-nome,
:root[data-tema="escuro"] .valor-fixo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .texto-fraco,
:root[data-tema="escuro"] .campo-form small,
:root[data-tema="escuro"] .campo small {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .icone-status--ativo,
:root[data-tema="escuro"] .badge--ativo {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .icone-status--inativo {
  background: var(--tenue-erro);
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .badge--perfil {
  background: var(--tenue-info);
  color: var(--cor-info);
  border-color: rgb(124 180 247 / 30%);
}

:root[data-tema="escuro"] .badge--permissao {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .linha-form {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .modal-dialog {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .modal-header {
  border-bottom-color: var(--cor-borda-suave);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .modal-etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .modal-titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .btn-fechar {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .menu-exportar-lista {
  background: var(--cor-superficie-elevada);
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .menu-exportar-lista button:hover,
:root[data-tema="escuro"] .menu-exportar-lista button:focus-visible {
  background: var(--cor-primaria-tenue);
}

:root[data-tema="escuro"] .menu-exportar-lista strong {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .menu-exportar-lista span {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .passos-importacao,
:root[data-tema="escuro"] .resumo-importacao {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .texto-erro {
  color: var(--cor-erro);
}

:root[data-tema="escuro"] .texto-ok {
  color: var(--cor-sucesso);
}

:root[data-tema="escuro"] .campo-arquivo:focus-within .btn-secundario {
  outline-color: var(--cor-primaria);
}

:root[data-tema="escuro"] .modal-footer {
  background: var(--cor-superficie-elevada);
  border-top-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .grupo {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .grupo legend {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo small {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .opcao {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .opcao-desc {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .opcao code {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .via-perfil {
  color: var(--cor-info);
}

:root[data-tema="escuro"] .resumo-efetivas {
  color: var(--cor-texto-secundario);
}
</style>
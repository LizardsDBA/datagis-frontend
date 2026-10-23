/**
 * Exportação e importação de usuários em CSV (tela Controle de Acesso).
 *
 * O arquivo segue o padrão do CSV (separador "," e aspas em volta da célula que tem vírgula) e
 * sai com BOM, para o Excel ler os acentos. Na leitura o separador é detectado pelo cabeçalho
 * ("," ou ";"), para aceitar também planilha salva no padrão do Excel em português. Listas
 * dentro de uma célula (perfis, permissões) também usam ",".
 */

export const COLUNAS_IMPORTACAO = [
  'login',
  'nome',
  'sobrenome',
  'email',
  'senha_temporaria',
  'perfis',
  'permissoes_avulsas',
]

const OBRIGATORIAS = ['login', 'nome', 'sobrenome', 'email', 'senha_temporaria']
const PADRAO_LOGIN = /^[A-Za-z0-9._@-]+$/
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SENHA_MINIMA = 8

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()

const normalizarCabecalho = (texto) => normalizar(texto).replace(/[\s-]+/g, '_')

/** Célula com aspas quando precisa; valor que o Excel leria como fórmula ganha um apóstrofo. */
function celula(valor) {
  let texto = String(valor ?? '')
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`
  return /[,;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function montarCsv(linhas) {
  return '﻿' + linhas.map((linha) => linha.map(celula).join(',')).join('\r\n') + '\r\n'
}

const doisDigitos = (n) => String(n).padStart(2, '0')

/** dd/mm/aaaa hh:mm, sem a vírgula que o toLocaleString põe entre a data e a hora. */
export function formatarDataHora(valor) {
  if (!valor) return ''
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ''
  const data = `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`
  return `${data} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
}

/** userDatagis_dd-mm-aaaa.<extensao> */
export function nomeArquivoExportacao(extensao, data = new Date()) {
  const dia = `${doisDigitos(data.getDate())}-${doisDigitos(data.getMonth() + 1)}-${data.getFullYear()}`
  return `userDatagis_${dia}.${extensao}`
}

export const CABECALHO_EXPORTACAO = [
  'login',
  'nome',
  'sobrenome',
  'email',
  'perfis',
  'permissoes_avulsas',
  'permissoes_efetivas',
  'criado_em',
  'ativo',
]

/** Uma linha por usuário, na ordem de CABECALHO_EXPORTACAO (usada no CSV e no PDF). */
export function linhasExportacao(usuarios, nomeDoPerfil = (codigo) => codigo) {
  return usuarios.map((u) => [
    u.login,
    u.nome,
    u.sobrenome,
    u.email,
    (u.perfis || []).map(nomeDoPerfil).join(', '),
    (u.permissoesAvulsas || []).join(', '),
    (u.permissoesEfetivas || []).join(', '),
    formatarDataHora(u.criadoEm),
    u.ativo ? 'Sim' : 'Não',
  ])
}

export function gerarCsvExportacao(usuarios, nomeDoPerfil = (codigo) => codigo) {
  return montarCsv([CABECALHO_EXPORTACAO, ...linhasExportacao(usuarios, nomeDoPerfil)])
}

export function gerarCsvModelo() {
  return montarCsv([
    COLUNAS_IMPORTACAO,
    ['maria.silva', 'Maria', 'Silva', 'maria.silva@exemplo.com', 'Trocar@123', 'Analista', ''],
  ])
}

/** Lê o CSV respeitando aspas (campo com separador, aspas duplicadas e quebra de linha). */
export function lerCsv(texto) {
  const conteudo = String(texto ?? '').replace(/^﻿/, '')
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0]
  const separador = (primeiraLinha.match(/;/g) || []).length > (primeiraLinha.match(/,/g) || []).length ? ';' : ','

  const linhas = []
  let linha = []
  let campo = ''
  let entreAspas = false
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i]
    if (entreAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') {
        entreAspas = false
      } else {
        campo += c
      }
    } else if (c === '"') {
      entreAspas = true
    } else if (c === separador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ''))
}

const separarLista = (texto) =>
  String(texto ?? '')
    .split(/[,|]/)
    .map((v) => v.trim())
    .filter(Boolean)

/**
 * Transforma o CSV em linhas prontas para cadastrar, cada uma com a lista de erros encontrados.
 * Perfil é aceito pelo nome ("Analista") ou pelo código; permissão, pelo código.
 *
 * @returns {{ erroArquivo: string|null, linhas: Array }}
 */
export function interpretarImportacao(texto, catalogo, loginsExistentes = []) {
  const tabela = lerCsv(texto)
  if (!tabela.length) return { erroArquivo: 'O arquivo está vazio.', linhas: [] }

  const cabecalho = tabela[0].map(normalizarCabecalho)
  const faltando = OBRIGATORIAS.filter((c) => !cabecalho.includes(c))
  if (faltando.length) {
    return {
      erroArquivo: `Faltam colunas no cabeçalho: ${faltando.join(', ')}. Use o modelo para importar.`,
      linhas: [],
    }
  }

  const perfilPorChave = new Map()
  catalogo.perfis.forEach((p) => {
    perfilPorChave.set(normalizar(p.codigo), p)
    perfilPorChave.set(normalizar(p.nome), p)
  })
  const permissoes = new Set(catalogo.permissoes.map((p) => p.codigo))
  const existentes = new Set(loginsExistentes.map(normalizar))
  const vistos = new Set()

  const linhas = tabela.slice(1).map((valores, indice) => {
    const v = Object.fromEntries(cabecalho.map((coluna, i) => [coluna, (valores[i] ?? '').trim()]))
    const erros = []

    OBRIGATORIAS.forEach((coluna) => {
      if (!v[coluna]) erros.push(`${coluna} em branco`)
    })
    if (v.login && !PADRAO_LOGIN.test(v.login)) erros.push('login com espaço ou acento')
    if (v.email && !PADRAO_EMAIL.test(v.email)) erros.push('e-mail inválido')
    if (v.senha_temporaria && v.senha_temporaria.length < SENHA_MINIMA) {
      erros.push(`senha com menos de ${SENHA_MINIMA} caracteres`)
    }
    const chaveLogin = normalizar(v.login)
    if (v.login && existentes.has(chaveLogin)) erros.push('login já cadastrado')
    else if (v.login && vistos.has(chaveLogin)) erros.push('login repetido no arquivo')
    if (v.login) vistos.add(chaveLogin)

    const perfis = []
    separarLista(v.perfis).forEach((nome) => {
      const perfil = perfilPorChave.get(normalizar(nome))
      if (perfil) perfis.push(perfil)
      else erros.push(`perfil desconhecido: ${nome}`)
    })
    const cobertas = new Set(perfis.flatMap((p) => p.permissoes))
    const avulsas = []
    separarLista(v.permissoes_avulsas).forEach((codigo) => {
      if (!permissoes.has(codigo)) erros.push(`permissão desconhecida: ${codigo}`)
      else if (!cobertas.has(codigo)) avulsas.push(codigo)
    })

    return {
      // +2: a linha 1 é o cabeçalho e a contagem da planilha começa em 1
      linha: indice + 2,
      login: v.login,
      nome: v.nome,
      sobrenome: v.sobrenome,
      email: v.email,
      perfis: perfis.map((p) => p.nome),
      erros,
      payload: {
        login: v.login,
        nome: v.nome,
        sobrenome: v.sobrenome,
        email: v.email,
        senhaTemporaria: v.senha_temporaria,
        roles: [...new Set(perfis.map((p) => p.codigo)), ...avulsas],
      },
    }
  })

  return { erroArquivo: linhas.length ? null : 'O arquivo não tem nenhum usuário abaixo do cabeçalho.', linhas }
}

export function baixarArquivo(conteudo, nome, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

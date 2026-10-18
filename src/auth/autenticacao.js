/**
 * Login via Keycloak (RBAC, LIZARDS-47).
 *
 * O app só monta depois que o usuário está logado (main.js chama iniciarAutenticacao com
 * onLoad 'login-required': sem sessão, o navegador vai pra tela de login do Keycloak e
 * volta autenticado). Fluxo Authorization Code + PKCE: cliente público, sem segredo no
 * navegador.
 *
 * `sessao` é reativo e guarda o que a interface precisa: nome do usuário, perfis (só pra
 * exibir) e permissões (o que de fato libera rota/menu/botão — mesma regra do backend).
 * Esconder no frontend é conforto; quem barra de verdade é o backend (403).
 */
import Keycloak from 'keycloak-js'
import { reactive } from 'vue'

const configuracao = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8180',
  realm: 'datagis',
  clientId: 'datagis-frontend',
}

let keycloak = null

export const sessao = reactive({
  autenticado: false,
  login: '',
  nome: '',
  perfis: [],
  permissoes: [],
})

export async function iniciarAutenticacao() {
  keycloak = new Keycloak(configuracao)
  await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  atualizarSessao()
  // Token de acesso dura poucos minutos; renova sozinho antes de vencer
  keycloak.onTokenExpired = () => {
    keycloak.updateToken(30).then(atualizarSessao).catch(() => keycloak.login())
  }
}

function atualizarSessao() {
  const token = keycloak?.tokenParsed || {}
  const roles = token.realm_access?.roles || []
  sessao.autenticado = Boolean(keycloak?.authenticated)
  sessao.login = token.preferred_username || ''
  sessao.nome = [token.given_name, token.family_name].filter(Boolean).join(' ') || sessao.login
  sessao.perfis = roles.filter((r) => r.startsWith('perfil-'))
  sessao.permissoes = roles.filter((r) => r.includes(':'))
}

/** Rota/botão sem permissão exigida é liberado pra qualquer usuário logado. */
export function temPermissao(permissao) {
  return !permissao || sessao.permissoes.includes(permissao)
}

/**
 * Token válido pra mandar ao backend (renova se faltar menos de 30s). Devolve null quando
 * não há sessão — só acontece fora do app de verdade (ex.: testes unitários).
 */
export async function obterToken() {
  if (!keycloak?.authenticated) return null
  try {
    await keycloak.updateToken(30)
    atualizarSessao()
    return keycloak.token
  } catch {
    keycloak.login()
    return null
  }
}

export function entrarNovamente() {
  keycloak?.login()
}

export function sair() {
  keycloak?.logout({ redirectUri: window.location.origin })
}

/** "perfil-administrador" -> "Administrador" (só exibição). */
export function nomeDoPerfil(codigo) {
  const nome = codigo.replace(/^perfil-/, '')
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

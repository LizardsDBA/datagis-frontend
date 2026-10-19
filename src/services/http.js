/**
 * Ponto único de chamada ao backend: igual ao fetch, mas manda o token do Keycloak em
 * `Authorization: Bearer`. Todo service usa apiFetch no lugar de fetch.
 *
 * Sem sessão (só em teste unitário) a chamada passa intacta pro fetch global — por isso
 * os testes que fazem vi.stubGlobal('fetch') continuam conferindo os mesmos argumentos.
 * 401 = sessão expirou de vez: manda pro login de novo. 403 fica com quem chamou (a
 * tela mostra a mensagem de erro normal).
 */
import { entrarNovamente, obterToken } from '../auth/autenticacao'

export async function apiFetch(url, options) {
  const token = await obterToken()
  if (!token) {
    return options === undefined ? fetch(url) : fetch(url, options)
  }
  const resposta = await fetch(url, {
    ...options,
    headers: { ...(options?.headers || {}), Authorization: `Bearer ${token}` },
  })
  if (resposta.status === 401) {
    entrarNovamente()
  }
  return resposta
}

/** Mesmo comportamento pra instâncias do axios (goldService). */
export function autenticarAxios(instancia) {
  instancia.interceptors.request.use(async (config) => {
    const token = await obterToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })
  return instancia
}

/**
 * Favoritos da tela inicial (/api/favoritos). Cada usuário lê e troca só os próprios: o
 * backend tira o usuário do token, não da requisição.
 */

import { apiFetch } from './http'

async function lerJson(resp, falha) {
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `${falha}: ${resp.statusText}`)
  }
  return resp.json()
}

/** Rotas favoritas do usuário logado, na ordem escolhida. */
export async function listarFavoritos() {
  const data = await lerJson(await apiFetch('/api/favoritos'), 'Falha ao carregar os favoritos')
  return data?.rotas || []
}

/** Troca a lista inteira; devolve a lista gravada. */
export async function salvarFavoritos(rotas) {
  const data = await lerJson(
    await apiFetch('/api/favoritos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotas }),
    }),
    'Falha ao salvar os favoritos',
  )
  return data?.rotas || []
}

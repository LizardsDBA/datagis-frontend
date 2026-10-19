/**
 * Serviço de comunicação com os endpoints de Conjuntos do DataGIS.
 */

import { apiFetch } from './http'

export async function buscarConjuntos() {
  const resp = await apiFetch('/conjuntos')
  if (!resp.ok) throw new Error(`Falha ao carregar conjuntos: ${resp.statusText}`)
  return resp.json()
}

export async function criarConjunto(payload) {
  const resp = await apiFetch('/conjuntos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || data?.mensagem || data?.message || `Falha ao criar conjunto: ${resp.statusText}`)
  }
  return resp.json()
}

export async function buscarFontes() {
  const resp = await apiFetch('/api/fontes')
  if (!resp.ok) throw new Error(`Falha ao carregar fontes: ${resp.statusText}`)
  return resp.json()
}

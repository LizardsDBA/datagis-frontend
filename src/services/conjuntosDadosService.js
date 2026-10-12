/**
 * Serviço de comunicação com os endpoints da tela de Conjunto de Dados do DataGIS —
 * comparação Bronze/Silver/Quarentena por lote. A parte de Quarentena não tem endpoint
 * próprio aqui: reaproveita `GET /api/quarentena` que já existe (ver `buscarQuarentenaDoLote`).
 */

import { apiFetch } from './http'

export async function buscarUltimoLote(fonteId) {
  const resp = await apiFetch(`/api/conjuntos-dados/fontes/${fonteId}/ultimo-lote`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `Falha ao buscar o último lote da fonte ${fonteId}`)
  }
  return resp.json()
}

export async function buscarBronze(loteId, pagina = 0, tamanho = 25) {
  const resp = await apiFetch(`/api/conjuntos-dados/lotes/${loteId}/bronze?pagina=${pagina}&tamanho=${tamanho}`)
  if (!resp.ok) throw new Error(`Falha ao carregar a Bronze do lote #${loteId}: ${resp.statusText}`)
  return resp.json()
}

export async function buscarSilver(loteId, pagina = 0, tamanho = 25) {
  const resp = await apiFetch(`/api/conjuntos-dados/lotes/${loteId}/silver?pagina=${pagina}&tamanho=${tamanho}`)
  if (!resp.ok) throw new Error(`Falha ao carregar a Silver do lote #${loteId}: ${resp.statusText}`)
  return resp.json()
}

/**
 * Busca todos os itens de quarentena do lote de uma vez (volume por lote é sempre
 * pequeno — dezenas, não milhares) — usado tanto pra aba Quarentena quanto pra
 * navegação cruzada por `registroBrutoId` (filtrada no cliente, ver `buscarNaListaPorRegistroBruto`).
 */
export async function buscarQuarentenaDoLote(loteId) {
  const resp = await apiFetch(`/api/quarentena?loteIngestaoId=${loteId}&pagina=0&tamanho=500`)
  if (!resp.ok) throw new Error(`Falha ao carregar a Quarentena do lote #${loteId}: ${resp.statusText}`)
  return resp.json()
}

export function buscarNaListaPorRegistroBruto(itens, registroBrutoId) {
  return itens.find((item) => item.registroBrutoId === registroBrutoId) || null
}

export async function buscarRegistroBronzePorId(registroBrutoId) {
  const resp = await apiFetch(`/api/conjuntos-dados/registros/${registroBrutoId}/bronze`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `Falha ao buscar o registro ${registroBrutoId} na Bronze`)
  }
  return resp.json()
}

/** Devolve `null` quando o registro nunca chegou na Silver (204 — não é erro). */
export async function buscarRegistroSilverPorId(registroBrutoId) {
  const resp = await apiFetch(`/api/conjuntos-dados/registros/${registroBrutoId}/silver`)
  if (resp.status === 204) return null
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `Falha ao buscar o registro ${registroBrutoId} na Silver`)
  }
  return resp.json()
}

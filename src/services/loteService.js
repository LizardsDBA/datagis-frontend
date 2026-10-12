/**
 * Serviço de comunicação com os endpoints de Lotes de Ingestão e Pipeline do DataGIS.
 */

import { apiFetch } from './http'

export async function buscarLotes() {
  const resp = await apiFetch('/api/lotes')
  if (!resp.ok) throw new Error(`Falha ao carregar lotes de ingestão: ${resp.statusText}`)
  return resp.json()
}

export async function buscarLotePorId(id) {
  const resp = await apiFetch(`/api/lotes/${id}`)
  if (!resp.ok) throw new Error(`Falha ao carregar lote #${id}: ${resp.statusText}`)
  return resp.json()
}

export async function liberarLote(loteId, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/lotes/${loteId}/liberar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analistaId }),
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || 'Falha ao liberar lote para a Silver')
  }
  return true
}

export async function descartarLote(loteId, motivo, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/lotes/${loteId}/descartar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo, analistaId }),
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || 'Falha ao descartar lote')
  }
  return true
}

/**
 * Serviço do log de auditoria (/api/auditoria, LIZARDS-48). Só consulta: quem grava é o
 * backend, automaticamente, a cada ação que altera dado.
 */

import { apiFetch } from './http'

export async function buscarLogAuditoria(filtros = {}, pagina = 0, tamanho = 50) {
  const query = new URLSearchParams({ pagina, tamanho })
  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== '') query.set(chave, valor)
  })
  const resp = await apiFetch(`/api/auditoria?${query.toString()}`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `Falha ao carregar o log de auditoria: ${resp.statusText}`)
  }
  return resp.json()
}

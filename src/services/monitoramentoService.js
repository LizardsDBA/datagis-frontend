/**
 * Serviço de comunicação com o endpoint agregador de monitoramento global.
 */
import { apiFetch } from './http'

export async function obterStatusGlobal() {
  const resp = await apiFetch('/api/monitoramento/status-global')
  if (!resp.ok) {
    throw new Error(`Falha ao obter status global de monitoramento: ${resp.statusText}`)
  }
  return resp.json()
}

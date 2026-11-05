/**
 * Minha conta (/api/minha-conta): o próprio usuário vê os dados, troca o nome e a senha.
 * O backend tira o usuário do token, não da requisição.
 */

import { apiFetch } from './http'

async function lerJson(resp, falha) {
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `${falha}: ${resp.statusText}`)
  }
  return resp.status === 204 ? null : resp.json()
}

function enviar(payload) {
  return { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}

export async function buscarMinhaConta() {
  return lerJson(await apiFetch('/api/minha-conta'), 'Falha ao carregar os seus dados')
}

export async function salvarNome(nome, sobrenome) {
  return lerJson(await apiFetch('/api/minha-conta', enviar({ nome, sobrenome })), 'Falha ao salvar o nome')
}

export async function trocarSenha(senhaAtual, novaSenha) {
  return lerJson(await apiFetch('/api/minha-conta/senha', enviar({ senhaAtual, novaSenha })), 'Falha ao trocar a senha')
}

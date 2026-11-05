/**
 * Serviço da administração de usuários e controle de acesso (/api/admin, LIZARDS-47).
 * O backend repassa tudo pro Keycloak; o id do usuário é o UUID dele lá.
 */

import { apiFetch } from './http'

async function lerJson(resp, falha) {
  if (!resp.ok) {
    const data = await resp.json().catch(() => null)
    throw new Error(data?.erro || `${falha}: ${resp.statusText}`)
  }
  return resp.status === 204 ? null : resp.json()
}

function enviar(metodo, payload) {
  return {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

export async function buscarCatalogoAcesso() {
  return lerJson(await apiFetch('/api/admin/catalogo-acesso'), 'Falha ao carregar perfis e permissões')
}

export async function buscarUsuarios(busca = '') {
  const query = busca ? `?busca=${encodeURIComponent(busca)}` : ''
  return lerJson(await apiFetch(`/api/admin/usuarios${query}`), 'Falha ao carregar usuários')
}

export async function criarUsuario(payload) {
  return lerJson(await apiFetch('/api/admin/usuarios', enviar('POST', payload)), 'Falha ao cadastrar usuário')
}

export async function atualizarUsuario(id, payload) {
  return lerJson(await apiFetch(`/api/admin/usuarios/${id}`, enviar('PUT', payload)), 'Falha ao atualizar usuário')
}

export async function definirRoles(id, roles) {
  return lerJson(await apiFetch(`/api/admin/usuarios/${id}/roles`, enviar('PUT', { roles })), 'Falha ao salvar acessos')
}

export async function redefinirSenha(id, senhaTemporaria) {
  return lerJson(
    await apiFetch(`/api/admin/usuarios/${id}/senha`, enviar('PUT', { senhaTemporaria })),
    'Falha ao redefinir senha',
  )
}

/** Se o usuário pode criar token de acesso (a criação do token entra depois). */
export async function buscarTokenAcesso(id) {
  const data = await lerJson(await apiFetch(`/api/admin/usuarios/${id}/token-acesso`), 'Falha ao carregar o token de acesso')
  return Boolean(data?.habilitado)
}

export async function definirTokenAcesso(id, habilitado) {
  const data = await lerJson(
    await apiFetch(`/api/admin/usuarios/${id}/token-acesso`, enviar('PUT', { habilitado })),
    'Falha ao salvar o token de acesso',
  )
  return Boolean(data?.habilitado)
}

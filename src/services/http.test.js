import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: { obterToken: vi.fn(), entrarNovamente: vi.fn() },
}))

vi.mock('../auth/autenticacao', () => auth)

import { apiFetch, autenticarAxios } from './http'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
  auth.obterToken.mockReset()
  auth.entrarNovamente.mockReset()
})

describe('apiFetch', () => {
  it('manda o token do Keycloak mantendo os headers e o corpo originais', async () => {
    auth.obterToken.mockResolvedValue('abc')

    await apiFetch('/api/fontes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

    expect(fetch).toHaveBeenCalledWith('/api/fontes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc' },
      body: '{}',
    })
  })

  it('sem sessão repassa a chamada intacta', async () => {
    auth.obterToken.mockResolvedValue(null)

    await apiFetch('/api/lotes')

    expect(fetch).toHaveBeenCalledWith('/api/lotes')
  })

  it('401 manda pro login de novo', async () => {
    auth.obterToken.mockResolvedValue('expirado')
    fetch.mockResolvedValue({ ok: false, status: 401 })

    await apiFetch('/api/lotes')

    expect(auth.entrarNovamente).toHaveBeenCalled()
  })

  it('403 não desloga: a tela trata como erro comum', async () => {
    auth.obterToken.mockResolvedValue('abc')
    fetch.mockResolvedValue({ ok: false, status: 403 })

    const resposta = await apiFetch('/api/admin/usuarios')

    expect(resposta.status).toBe(403)
    expect(auth.entrarNovamente).not.toHaveBeenCalled()
  })
})

describe('autenticarAxios', () => {
  it('interceptor coloca o Authorization em toda requisição', async () => {
    auth.obterToken.mockResolvedValue('abc')
    const use = vi.fn()
    autenticarAxios({ interceptors: { request: { use } } })

    const config = await use.mock.calls[0][0]({ headers: {} })

    expect(config.headers.Authorization).toBe('Bearer abc')
  })
})

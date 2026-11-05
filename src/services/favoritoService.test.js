import { afterEach, describe, expect, it, vi } from 'vitest'
import { listarFavoritos, salvarFavoritos } from './favoritoService'
import { apiFetch } from './http'

vi.mock('./http', () => ({ apiFetch: vi.fn() }))

afterEach(() => vi.clearAllMocks())

const resposta = (corpo, ok = true) => ({ ok, statusText: ok ? 'OK' : 'Bad Request', json: async () => corpo })

describe('favoritoService', () => {
  it('lista as rotas favoritas', async () => {
    apiFetch.mockResolvedValue(resposta({ rotas: ['/fontes', '/lotes'] }))

    await expect(listarFavoritos()).resolves.toEqual(['/fontes', '/lotes'])
    expect(apiFetch).toHaveBeenCalledWith('/api/favoritos')
  })

  it('salva a lista inteira com PUT', async () => {
    apiFetch.mockResolvedValue(resposta({ rotas: ['/lotes'] }))

    await expect(salvarFavoritos(['/lotes'])).resolves.toEqual(['/lotes'])
    const [url, opcoes] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/favoritos')
    expect(opcoes.method).toBe('PUT')
    expect(JSON.parse(opcoes.body)).toEqual({ rotas: ['/lotes'] })
  })

  it('passa adiante a mensagem de erro do backend', async () => {
    apiFetch.mockResolvedValue(resposta({ erro: 'No maximo 20 favoritos' }, false))

    await expect(salvarFavoritos([])).rejects.toThrow('No maximo 20 favoritos')
  })
})

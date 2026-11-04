import { afterEach, describe, expect, it, vi } from 'vitest'
import { buscarMinhaConta, salvarNome, trocarSenha } from './minhaContaService'
import { apiFetch } from './http'

vi.mock('./http', () => ({ apiFetch: vi.fn() }))

afterEach(() => vi.clearAllMocks())

const resposta = (corpo, ok = true, status = 200) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Bad Request',
  json: async () => corpo,
})

describe('minhaContaService', () => {
  it('busca os dados do usuário logado', async () => {
    apiFetch.mockResolvedValue(resposta({ login: 'maria' }))

    await expect(buscarMinhaConta()).resolves.toEqual({ login: 'maria' })
    expect(apiFetch).toHaveBeenCalledWith('/api/minha-conta')
  })

  it('salva só nome e sobrenome', async () => {
    apiFetch.mockResolvedValue(resposta({ nome: 'Maria' }))

    await salvarNome('Maria', 'Souza')
    const [url, opcoes] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/minha-conta')
    expect(opcoes.method).toBe('PUT')
    expect(JSON.parse(opcoes.body)).toEqual({ nome: 'Maria', sobrenome: 'Souza' })
  })

  it('troca a senha mandando a atual e a nova; 204 não tem corpo', async () => {
    apiFetch.mockResolvedValue(resposta(null, true, 204))

    await expect(trocarSenha('Atual@2026', 'Nova@2026x')).resolves.toBeNull()
    const [url, opcoes] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/minha-conta/senha')
    expect(JSON.parse(opcoes.body)).toEqual({ senhaAtual: 'Atual@2026', novaSenha: 'Nova@2026x' })
  })

  it('passa adiante a mensagem de erro do backend', async () => {
    apiFetch.mockResolvedValue(resposta({ erro: 'Senha atual incorreta' }, false, 400))

    await expect(trocarSenha('errada', 'Nova@2026x')).rejects.toThrow('Senha atual incorreta')
  })
})

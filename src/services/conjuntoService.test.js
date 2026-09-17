import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarConjuntos, buscarFontes, criarConjunto } from './conjuntoService'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

describe('consultas de conjuntos e fontes', () => {
  it.each([
    [buscarConjuntos, '/conjuntos', 'conjuntos'],
    [buscarFontes, '/api/fontes', 'fontes'],
  ])('consulta %s pela rota configurada', async (consultar, rota) => {
    const dados = [{ id: 7, nome: 'CAR PR' }]
    fetch.mockResolvedValue({ ok: true, json: async () => dados })
    await expect(consultar()).resolves.toEqual(dados)
    expect(fetch).toHaveBeenCalledWith(rota)
  })

  it.each([
    [buscarConjuntos, 'conjuntos'],
    [buscarFontes, 'fontes'],
  ])('informa falha HTTP em %s', async (consultar, recurso) => {
    fetch.mockResolvedValue({ ok: false, statusText: 'Service Unavailable' })
    await expect(consultar()).rejects.toThrow(`Falha ao carregar ${recurso}: Service Unavailable`)
  })
})

describe('cadastro de conjunto', () => {
  const payload = { fonteDadoId: 7, competencia: '2026-09-01', statusCamada: 'ATIVA', coberturaTerritorial: null }

  it('envia JSON e retorna o conjunto criado', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 42, ...payload }) })
    await expect(criarConjunto(payload)).resolves.toEqual({ id: 42, ...payload })
    expect(fetch).toHaveBeenCalledWith('/conjuntos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
  })

  it.each(['erro', 'mensagem', 'message'])('exibe a mensagem recebida no campo %s', async (campo) => {
    fetch.mockResolvedValue({ ok: false, statusText: 'Bad Request', json: async () => ({ [campo]: 'Fonte não encontrada' }) })
    await expect(criarConjunto(payload)).rejects.toThrow('Fonte não encontrada')
  })

  it('usa mensagem alternativa se o erro não contém JSON', async () => {
    fetch.mockResolvedValue({ ok: false, statusText: 'Bad Gateway', json: async () => { throw new SyntaxError() } })
    await expect(criarConjunto(payload)).rejects.toThrow('Falha ao criar conjunto: Bad Gateway')
  })

  it('propaga falha de rede', async () => {
    fetch.mockRejectedValue(new Error('Sem conexão'))
    await expect(criarConjunto(payload)).rejects.toThrow('Sem conexão')
  })
})

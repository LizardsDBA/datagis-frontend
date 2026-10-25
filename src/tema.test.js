import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alternarTema, estadoTema, iniciarTema } from './tema'

// jsdom não tem matchMedia: cada teste diz qual é a preferência do sistema
function sistemaPrefere(escuro) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: escuro })))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.tema
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('tema', () => {
  it('sem escolha salva, segue o sistema configurado como escuro', () => {
    sistemaPrefere(true)
    iniciarTema()

    expect(estadoTema.atual).toBe('escuro')
    expect(document.documentElement.dataset.tema).toBe('escuro')
  })

  it('sem escolha salva, segue o sistema configurado como claro', () => {
    sistemaPrefere(false)
    iniciarTema()

    expect(estadoTema.atual).toBe('claro')
    expect(document.documentElement.dataset.tema).toBe('claro')
  })

  it('a escolha salva vale mais que a preferência do sistema', () => {
    sistemaPrefere(true)
    localStorage.setItem('datagis.tema', 'claro')
    iniciarTema()

    expect(estadoTema.atual).toBe('claro')
  })

  it('valor salvo desconhecido é ignorado e cai na preferência do sistema', () => {
    sistemaPrefere(true)
    localStorage.setItem('datagis.tema', 'azul')
    iniciarTema()

    expect(estadoTema.atual).toBe('escuro')
  })

  it('alternar troca o tema no <html> e guarda a escolha', () => {
    sistemaPrefere(false)
    iniciarTema()

    alternarTema()
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(localStorage.getItem('datagis.tema')).toBe('escuro')

    alternarTema()
    expect(document.documentElement.dataset.tema).toBe('claro')
    expect(localStorage.getItem('datagis.tema')).toBe('claro')
  })

  it('sem localStorage disponível, o tema ainda funciona e alterna', () => {
    sistemaPrefere(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    iniciarTema()
    expect(estadoTema.atual).toBe('escuro')

    alternarTema()
    expect(estadoTema.atual).toBe('claro')
  })
})

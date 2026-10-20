import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Sidebar from './Sidebar.vue'
import { alternarTema, estadoTema } from '../tema'

// Sessão de mentira: só o necessário para o rodapé (nome, perfil e sair)
const { sessaoTeste } = vi.hoisted(() => ({
  sessaoTeste: { login: 'analista', nome: 'Analista Teste', perfis: ['perfil-analista'], permissoes: [] },
}))
vi.mock('../auth/autenticacao', () => ({
  sessao: sessaoTeste,
  temPermissao: (p) => !p || sessaoTeste.permissoes.includes(p),
  nomeDoPerfil: (c) => c.replace('perfil-', ''),
  sair: vi.fn(),
}))
vi.mock('../tema', async () => {
  const { reactive } = await import('vue')
  const estadoTema = reactive({ atual: 'claro' })
  return {
    estadoTema,
    alternarTema: vi.fn(() => {
      estadoTema.atual = estadoTema.atual === 'escuro' ? 'claro' : 'escuro'
    }),
  }
})

function montar() {
  return mount(Sidebar, { global: { stubs: { 'router-link': RouterLinkStub } } })
}

beforeEach(() => {
  estadoTema.atual = 'claro'
  vi.mocked(alternarTema).mockClear()
})

describe('Sidebar — botão de tema no rodapé', () => {
  it('no tema claro, o botão oferece o tema escuro', () => {
    const botao = montar().find('.btn-tema')

    expect(botao.exists()).toBe(true)
    expect(botao.attributes('aria-label')).toBe('Usar tema escuro')
  })

  it('clicar no botão alterna o tema e o rótulo acompanha', async () => {
    const wrapper = montar()

    await wrapper.find('.btn-tema').trigger('click')

    expect(alternarTema).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.btn-tema').attributes('aria-label')).toBe('Usar tema claro')
  })

  it('o botão de tema fica ao lado do Sair', () => {
    const botoes = montar().findAll('.rodape button').map((b) => b.classes()[0])

    expect(botoes).toEqual(['btn-tema', 'btn-sair'])
  })
})

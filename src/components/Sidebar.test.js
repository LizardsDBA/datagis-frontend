import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Sidebar from './Sidebar.vue'
import { alternarTema, estadoTema } from '../tema'
import { sair } from '../auth/autenticacao'

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
const rotaAtual = vi.hoisted(() => ({ path: '/' }))
vi.mock('vue-router', () => ({ useRoute: () => rotaAtual }))
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
  rotaAtual.path = '/'
  sessaoTeste.permissoes = []
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

  it('com a sidebar recolhida, o botão de tema continua no rodapé e alterna o tema', async () => {
    const wrapper = montar()
    await wrapper.find('.btn-toggle-desktop').trigger('click')

    const botoes = wrapper.findAll('.rodape button').map((b) => b.classes()[0])
    expect(botoes).toEqual(['btn-tema', 'btn-sair'])

    await wrapper.find('.rodape .btn-tema').trigger('click')
    expect(alternarTema).toHaveBeenCalledTimes(1)
  })

  it('com a sidebar recolhida, o Sair continua no rodapé e encerra a sessão', async () => {
    const wrapper = montar()
    await wrapper.find('.btn-toggle-desktop').trigger('click')

    const botao = wrapper.find('.rodape .btn-sair')
    expect(botao.attributes('aria-label')).toBe('Sair')

    await botao.trigger('click')
    expect(sair).toHaveBeenCalledTimes(1)
  })
})

describe('Sidebar — Indicadores e Resultados: um item para o mapa e a tabela (LIZARDS-35)', () => {
  const TODAS = ['conjunto:visualizar', 'indicador:visualizar']

  it('um só item "Indicadores e Resultados", que leva ao mapa', () => {
    sessaoTeste.permissoes = TODAS
    const wrapper = montar()

    const item = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/conjuntos')
    expect(item.text()).toContain('Indicadores e Resultados')
    expect(wrapper.text()).not.toContain('Conjuntos e Cobertura')
    expect(wrapper.text().match(/Indicadores e Resultados/g)).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Publicação & Resultados')
    expect(wrapper.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).not.toContain('/indicadores')
  })

  it('com a tabela aberta, o item continua marcado no menu', () => {
    sessaoTeste.permissoes = TODAS
    rotaAtual.path = '/indicadores'
    const item = montar().findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/conjuntos')

    expect(item.classes()).toContain('item-menu--ativo')
  })

  it('em outra tela, o item não fica marcado por relação', () => {
    sessaoTeste.permissoes = TODAS
    rotaAtual.path = '/fontes'
    const item = montar().findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/conjuntos')

    expect(item.classes()).not.toContain('item-menu--ativo')
  })
})

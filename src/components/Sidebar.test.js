import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('vue-router', () => ({ useRoute: () => rotaAtual, useRouter: () => ({ push: vi.fn() }) }))
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
  it('a Home fica no topo, na seção Tela inicial, até para quem não tem permissão nenhuma', () => {
    sessaoTeste.permissoes = []
    const wrapper = montar()

    expect(wrapper.find('.menu-secao-rotulo').text()).toBe('Tela inicial')
    const primeiro = wrapper.findAllComponents(RouterLinkStub)[0]
    expect(primeiro.props('to')).toBe('/')
    expect(primeiro.text()).toContain('Home')
  })

  describe('grupo Controle de Acesso', () => {
    const GERENCIAR = 'usuario:gerenciar'
    const subitens = (wrapper) =>
      wrapper.findAllComponents(RouterLinkStub).filter((l) => l.classes().includes('subitem'))

    it('fica fechado fora das telas de administração e abre pelo cabeçalho', async () => {
      sessaoTeste.permissoes = [GERENCIAR]
      const wrapper = montar()

      const cabeca = wrapper.find('.grupo-cabeca')
      expect(cabeca.text()).toContain('Controle de Acesso')
      expect(cabeca.attributes('aria-expanded')).toBe('false')
      expect(subitens(wrapper)).toHaveLength(0)

      await cabeca.trigger('click')
      expect(cabeca.attributes('aria-expanded')).toBe('true')
      expect(subitens(wrapper).map((l) => [l.text(), l.props('to')])).toEqual([
        ['Visão geral', '/admin/controle-acesso'],
        ['Usuários', '/admin/usuarios'],
        ['Perfis', '/admin/perfis'],
        ['Matriz de Acesso', '/admin/matriz-acesso'],
      ])

      await cabeca.trigger('click')
      expect(subitens(wrapper)).toHaveLength(0)
    })

    it('abre sozinho quando a tela aberta é de dentro do grupo', () => {
      sessaoTeste.permissoes = [GERENCIAR]
      rotaAtual.path = '/admin/usuarios'
      const wrapper = montar()

      expect(wrapper.find('.grupo-cabeca').attributes('aria-expanded')).toBe('true')
      expect(wrapper.find('.grupo-cabeca').classes()).toContain('item-menu--ativo')
    })

    it('cada tela tem o atalho para abrir em nova aba', async () => {
      sessaoTeste.permissoes = [GERENCIAR]
      const wrapper = montar()
      await wrapper.find('.grupo-cabeca').trigger('click')

      const novaAba = wrapper.find('[aria-label="Abrir Usuários em nova aba"]')
      expect(novaAba.attributes('href')).toBe('/admin/usuarios')
      expect(novaAba.attributes('target')).toBe('_blank')
      expect(novaAba.attributes('rel')).toContain('noopener')
    })

    it('sem a permissão, o grupo não aparece', () => {
      sessaoTeste.permissoes = []
      const wrapper = montar()

      expect(wrapper.find('.grupo-cabeca').exists()).toBe(false)
    })

    function montarComTeleport() {
      return mount(Sidebar, { global: { stubs: { 'router-link': RouterLinkStub, teleport: true } } })
    }

    it('com a barra recolhida, o ícone abre um menu flutuante com as telas do grupo', async () => {
      sessaoTeste.permissoes = [GERENCIAR]
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')

      expect(wrapper.find('.grupo-cabeca').exists()).toBe(false)
      const icone = wrapper.find('.grupo-icone-recolhido')
      expect(icone.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)

      await icone.trigger('click')
      expect(icone.attributes('aria-expanded')).toBe('true')
      const menu = wrapper.find('.menu-flutuante')
      expect(menu.find('.menu-flutuante-titulo').text()).toBe('Controle de Acesso')
      expect(menu.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual([
        '/admin/controle-acesso',
        '/admin/usuarios',
        '/admin/perfis',
        '/admin/matriz-acesso',
      ])
      expect(menu.find('[aria-label="Abrir Perfis em nova aba"]').attributes('target')).toBe('_blank')
    })

    it('o menu flutuante fecha ao escolher uma tela, com Esc e clicando de novo no ícone', async () => {
      sessaoTeste.permissoes = [GERENCIAR]
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')
      const icone = wrapper.find('.grupo-icone-recolhido')

      await icone.trigger('click')
      await wrapper.find('.menu-flutuante .subitem').trigger('click')
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)

      await icone.trigger('click')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)

      await icone.trigger('click')
      await icone.trigger('click')
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)
    })

    it('expandir a barra fecha o menu flutuante', async () => {
      sessaoTeste.permissoes = [GERENCIAR]
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')
      await wrapper.find('.grupo-icone-recolhido').trigger('click')

      await wrapper.find('.marca-icone--botao').trigger('click')
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)
      expect(wrapper.find('.grupo-cabeca').exists()).toBe(true)
    })
  })

  describe('barra recolhida: passar o mouse mostra o nome da tela', () => {
    function montarComTeleport() {
      return mount(Sidebar, { global: { stubs: { 'router-link': RouterLinkStub, teleport: true } } })
    }
    afterEach(() => vi.useRealTimers())

    it('num item comum, mostra o nome ao lado, que também leva à tela', async () => {
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')

      const home = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/')
      await home.trigger('mouseenter')

      const menu = wrapper.find('.menu-flutuante')
      expect(menu.exists()).toBe(true)
      const titulo = menu.findComponent(RouterLinkStub)
      expect(titulo.text()).toBe('Home')
      expect(titulo.props('to')).toBe('/')
      expect(menu.find('.grupo-lista').exists()).toBe(false)
    })

    it('num grupo, mostra o nome e as telas embaixo', async () => {
      sessaoTeste.permissoes = ['usuario:gerenciar']
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')
      await wrapper.find('.grupo-icone-recolhido').trigger('mouseenter')

      const menu = wrapper.find('.menu-flutuante')
      expect(menu.find('.menu-flutuante-titulo').text()).toBe('Controle de Acesso')
      expect(menu.findAll('.grupo-lista .subitem')).toHaveLength(4)
    })

    it('fecha um pouco depois de o mouse sair, mas não se ele entrar no menu', async () => {
      vi.useFakeTimers()
      const wrapper = montarComTeleport()
      await wrapper.find('.btn-toggle-desktop').trigger('click')
      const home = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/')

      await home.trigger('mouseenter')
      await home.trigger('mouseleave')
      await wrapper.find('.menu-flutuante').trigger('mouseenter')
      vi.advanceTimersByTime(500)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.menu-flutuante').exists()).toBe(true)

      await wrapper.find('.menu-flutuante').trigger('mouseleave')
      vi.advanceTimersByTime(500)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)
    })

    it('com a barra aberta, passar o mouse não abre nada', async () => {
      const wrapper = montarComTeleport()
      const home = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/')
      await home.trigger('mouseenter')

      expect(wrapper.find('.menu-flutuante').exists()).toBe(false)
    })
  })
})

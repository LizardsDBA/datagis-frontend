import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ControleAcessoView from './ControleAcessoView.vue'
import PerfisAcessoView from './PerfisAcessoView.vue'
import MatrizAcessoView from './MatrizAcessoView.vue'
import { buscarCatalogoAcesso, buscarUsuarios } from '../services/usuarioService'

vi.mock('../services/usuarioService', () => ({
  buscarCatalogoAcesso: vi.fn(),
  buscarUsuarios: vi.fn(),
}))

const CATALOGO = {
  perfis: [
    {
      codigo: 'perfil-administrador',
      nome: 'Administrador',
      descricao: 'Tudo',
      permissoes: ['fonte:visualizar', 'lote:gerenciar', 'usuario:gerenciar'],
    },
    { codigo: 'perfil-auditor', nome: 'Auditor', descricao: 'Só leitura', permissoes: ['fonte:visualizar'] },
  ],
  permissoes: [
    { codigo: 'fonte:visualizar', descricao: 'Ver fontes' },
    { codigo: 'lote:gerenciar', descricao: 'Liberar lotes' },
    { codigo: 'usuario:gerenciar', descricao: 'Gerenciar usuários' },
  ],
}

const USUARIOS = [
  { id: 'u1', login: 'admin', nome: 'Admin', sobrenome: 'Teste', ativo: true, perfis: ['perfil-administrador'], permissoesAvulsas: [] },
  { id: 'u2', login: 'ana', nome: 'Ana', sobrenome: 'Lima', ativo: false, perfis: ['perfil-auditor'], permissoesAvulsas: [] },
  { id: 'u3', login: 'solto', nome: 'Sem', sobrenome: 'Perfil', ativo: true, perfis: [], permissoesAvulsas: ['lote:gerenciar'] },
]

const stubs = { global: { stubs: { 'router-link': RouterLinkStub } } }

beforeEach(() => {
  buscarCatalogoAcesso.mockResolvedValue(CATALOGO)
  buscarUsuarios.mockResolvedValue(USUARIOS)
})

afterEach(() => vi.clearAllMocks())

describe('ControleAcessoView', () => {
  it('mostra um card por área com o resumo de cada uma', async () => {
    const wrapper = mount(ControleAcessoView, stubs)
    await flushPromises()

    const links = wrapper.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links).toEqual(['/admin/usuarios', '/admin/perfis', '/admin/matriz-acesso'])
    const texto = wrapper.text()
    expect(texto).toContain('3 cadastrado(s) · 2 ativo(s)')
    expect(texto).toContain('2 perfis')
    expect(texto).toContain('3 permissões')
  })

  it('um resumo que falha não derruba os outros cards', async () => {
    buscarUsuarios.mockRejectedValue(new Error('Keycloak fora'))
    const wrapper = mount(ControleAcessoView, stubs)
    await flushPromises()

    expect(wrapper.findAll('.card-resumo')[0].text()).toBe('—')
    expect(wrapper.text()).toContain('2 perfis')
  })
})

describe('PerfisAcessoView', () => {
  it('lista o que cada perfil libera e quem tem o perfil', async () => {
    const wrapper = mount(PerfisAcessoView, stubs)
    await flushPromises()

    const [admin, auditor] = wrapper.findAll('.card-perfil')
    expect(admin.find('.perfil-nome').text()).toBe('Administrador')
    expect(admin.find('.lista-areas').text()).toContain('Lotes e pipeline')
    expect(admin.find('.lista-areas').text()).toContain('Liberar lotes')
    expect(admin.find('.lista-usuarios').text()).toContain('admin')
    expect(auditor.find('.lista-usuarios').text()).toContain('Inativo')
    expect(wrapper.text()).toContain('Usuários sem perfil')
    expect(wrapper.text()).toContain('solto')
  })

  it('é só consulta: não tem botão de salvar nem de editar', async () => {
    const wrapper = mount(PerfisAcessoView, stubs)
    await flushPromises()

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('.aviso-leitura').exists()).toBe(true)
  })
})

describe('MatrizAcessoView', () => {
  async function montarMatriz() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/fontes', component: { template: '<div />' }, meta: { permissao: 'fonte:visualizar', titulo: 'Cadastro de Fontes' } },
        { path: '/admin/usuarios', component: { template: '<div />' }, meta: { permissao: 'usuario:gerenciar', titulo: 'Usuários' } },
      ],
    })
    const wrapper = mount(MatrizAcessoView, { global: { plugins: [router], stubs: { 'router-link': RouterLinkStub } } })
    await flushPromises()
    return wrapper
  }

  it('marca em qual perfil está cada permissão e as telas que ela libera', async () => {
    const wrapper = await montarMatriz()

    const linhas = wrapper.findAll('tbody tr:not(.linha-area)')
    expect(linhas).toHaveLength(3)
    const [fonte, lote, usuario] = linhas
    expect(fonte.findAll('.marca-sim')).toHaveLength(2)
    expect(fonte.find('.col-telas').text()).toContain('Cadastro de Fontes')
    expect(lote.findAll('.marca-sim')).toHaveLength(1)
    expect(lote.find('.col-telas').text()).toContain('Ações dentro das telas da área')
    expect(usuario.find('.col-telas').text()).toContain('Usuários')
    expect(wrapper.find('tfoot').text()).toContain('3')
  })

  it('agrupa as permissões por área', async () => {
    const wrapper = await montarMatriz()
    expect(wrapper.findAll('.linha-area').map((l) => l.text())).toEqual([
      'Fontes de dados',
      'Lotes e pipeline',
      'Usuários e acessos',
    ])
  })
})

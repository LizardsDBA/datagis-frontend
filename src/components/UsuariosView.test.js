import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UsuariosView from './UsuariosView.vue'
import {
  atualizarUsuario,
  buscarCatalogoAcesso,
  buscarUsuarios,
  criarUsuario,
  definirRoles,
} from '../services/usuarioService'

vi.mock('../services/usuarioService', () => ({
  buscarCatalogoAcesso: vi.fn(),
  buscarUsuarios: vi.fn(),
  criarUsuario: vi.fn(),
  atualizarUsuario: vi.fn(),
  definirRoles: vi.fn(),
  redefinirSenha: vi.fn(),
}))

vi.mock('../auth/autenticacao', () => ({
  sessao: { login: 'admin', nome: 'Admin', perfis: [], permissoes: [] },
  nomeDoPerfil: (codigo) => codigo.replace('perfil-', ''),
}))

const CATALOGO = {
  perfis: [
    {
      codigo: 'perfil-administrador',
      nome: 'Administrador',
      descricao: 'Tudo',
      permissoes: ['fonte:visualizar', 'usuario:gerenciar'],
    },
  ],
  permissoes: [
    { codigo: 'fonte:visualizar', descricao: 'Ver fontes' },
    { codigo: 'lote:gerenciar', descricao: 'Liberar lotes' },
    { codigo: 'usuario:gerenciar', descricao: 'Gerenciar usuários' },
  ],
}

const USUARIOS = [
  {
    id: 'u-admin',
    login: 'admin',
    nome: 'Admin',
    sobrenome: '(teste)',
    email: 'admin@datagis.local',
    ativo: true,
    perfis: ['perfil-administrador'],
    permissoesAvulsas: [],
    permissoesEfetivas: ['fonte:visualizar', 'usuario:gerenciar'],
  },
  {
    id: 'u-maria',
    login: 'maria',
    nome: 'Maria',
    sobrenome: 'Silva',
    email: 'maria@x.com',
    ativo: true,
    perfis: [],
    permissoesAvulsas: ['lote:gerenciar'],
    permissoesEfetivas: ['lote:gerenciar'],
  },
]

async function montar() {
  const wrapper = mount(UsuariosView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  buscarCatalogoAcesso.mockResolvedValue(CATALOGO)
  buscarUsuarios.mockResolvedValue(USUARIOS)
  criarUsuario.mockResolvedValue({})
  atualizarUsuario.mockResolvedValue({})
  definirRoles.mockResolvedValue({})
})

afterEach(() => vi.clearAllMocks())

describe('UsuariosView', () => {
  it('lista usuários com perfis e permissões avulsas', async () => {
    const wrapper = await montar()

    const linhas = wrapper.findAll('tbody tr')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].text()).toContain('administrador')
    expect(linhas[1].text()).toContain('lote:gerenciar')
  })

  it('não deixa o administrador desativar o próprio usuário', async () => {
    const wrapper = await montar()

    const [linhaAdmin, linhaMaria] = wrapper.findAll('tbody tr')
    expect(linhaAdmin.findAll('button').at(-1).attributes('disabled')).toBeDefined()
    expect(linhaMaria.findAll('button').at(-1).attributes('disabled')).toBeUndefined()
  })

  it('marcar um perfil cobre as permissões dele e mostra as efetivas', async () => {
    const wrapper = await montar()
    await wrapper.find('.btn-primario').trigger('click')

    await wrapper.find('input[value="perfil-administrador"]').setValue(true)

    expect(wrapper.find('.resumo-efetivas').text()).toContain('fonte:visualizar')
    expect(wrapper.find('.resumo-efetivas').text()).toContain('usuario:gerenciar')
    expect(wrapper.find('input[value="lote:gerenciar"]').exists()).toBe(true)
    // permissão coberta pelo perfil vira "via perfil" e sai do v-model de avulsas
    expect(wrapper.find('input[value="fonte:visualizar"]').exists()).toBe(false)
  })

  it('cadastra enviando perfis e só as avulsas que o perfil não cobre', async () => {
    const wrapper = await montar()
    await wrapper.find('.btn-primario').trigger('click')

    const campos = wrapper.findAll('.modal-dialog input.campo-texto')
    await campos[0].setValue('joao')
    await campos[1].setValue('joao@x.com')
    await campos[2].setValue('João')
    await campos[3].setValue('Souza')
    await campos[4].setValue('Senha@123')
    await wrapper.find('input[value="perfil-administrador"]').setValue(true)
    await wrapper.find('input[value="lote:gerenciar"]').setValue(true)
    await wrapper.find('form.modal-dialog').trigger('submit')
    await flushPromises()

    expect(criarUsuario).toHaveBeenCalledWith({
      login: 'joao',
      nome: 'João',
      sobrenome: 'Souza',
      email: 'joao@x.com',
      senhaTemporaria: 'Senha@123',
      roles: ['perfil-administrador', 'lote:gerenciar'],
    })
  })

  it('edição salva dados e substitui os acessos', async () => {
    const wrapper = await montar()
    await wrapper.findAll('tbody tr')[1].find('button').trigger('click')

    await wrapper.find('input[value="lote:gerenciar"]').setValue(false)
    await wrapper.find('form.modal-dialog').trigger('submit')
    await flushPromises()

    expect(atualizarUsuario).toHaveBeenCalledWith('u-maria', {
      nome: 'Maria',
      sobrenome: 'Silva',
      email: 'maria@x.com',
      ativo: true,
    })
    expect(definirRoles).toHaveBeenCalledWith('u-maria', [])
  })
})

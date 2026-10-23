import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import UsuariosView from './UsuariosView.vue'
import {
  atualizarUsuario,
  buscarCatalogoAcesso,
  buscarUsuarios,
  criarUsuario,
  definirRoles,
} from '../services/usuarioService'
import { gerarPdfUsuarios } from '../services/usuariosPdf'

vi.mock('../services/usuarioService', () => ({
  buscarCatalogoAcesso: vi.fn(),
  buscarUsuarios: vi.fn(),
  criarUsuario: vi.fn(),
  atualizarUsuario: vi.fn(),
  definirRoles: vi.fn(),
  redefinirSenha: vi.fn(),
}))

vi.mock('../services/usuariosPdf', () => ({ gerarPdfUsuarios: vi.fn() }))

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

function arquivoCsv(conteudo) {
  return { name: 'usuarios.csv', text: () => Promise.resolve(conteudo) }
}

async function escolherArquivo(wrapper, conteudo) {
  const input = wrapper.find('.campo-arquivo input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [arquivoCsv(conteudo)], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const botao = (wrapper, texto) => wrapper.findAll('button').find((b) => b.text().startsWith(texto))

async function montar() {
  const wrapper = mount(UsuariosView, { global: { stubs: { 'router-link': RouterLinkStub } } })
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
    // avulsas ficam no detalhe expandido da linha
    await linhas[1].trigger('click')
    expect(wrapper.find('.linha-detalhe').text()).toContain('lote:gerenciar')
  })

  it('desativar pede confirmação numa janela e só grava ao confirmar', async () => {
    const wrapper = await montar()
    const linhaMaria = wrapper.findAll('tbody tr')[1]

    await linhaMaria.findAll('button').at(-1).trigger('click')
    const janela = wrapper.find('.modal-confirmacao')
    expect(janela.find('.confirmacao-titulo').text()).toBe('Desativar usuário?')
    expect(janela.text()).toContain('maria')
    expect(janela.text()).toContain('Deixa de conseguir entrar no DataGIS')
    expect(atualizarUsuario).not.toHaveBeenCalled()

    await janela.find('.btn-perigo').trigger('click')
    await flushPromises()

    expect(atualizarUsuario).toHaveBeenCalledWith('u-maria', {
      nome: 'Maria',
      sobrenome: 'Silva',
      email: 'maria@x.com',
      ativo: false,
    })
    expect(wrapper.find('.modal-confirmacao').exists()).toBe(false)
  })

  it('cancelar a confirmação não altera nada', async () => {
    const wrapper = await montar()

    await wrapper.findAll('tbody tr')[1].findAll('button').at(-1).trigger('click')
    await wrapper.findAll('.modal-confirmacao button').find((b) => b.text() === 'Cancelar').trigger('click')

    expect(wrapper.find('.modal-confirmacao').exists()).toBe(false)
    expect(atualizarUsuario).not.toHaveBeenCalled()
  })

  it('usuário inativo recebe a confirmação de reativar', async () => {
    buscarUsuarios.mockResolvedValue([USUARIOS[0], { ...USUARIOS[1], ativo: false }])
    const wrapper = await montar()

    await wrapper.findAll('tbody tr')[1].findAll('button').at(-1).trigger('click')

    const janela = wrapper.find('.modal-confirmacao')
    expect(janela.find('.confirmacao-titulo').text()).toBe('Reativar usuário?')
    expect(janela.find('.btn-primario').text()).toBe('Reativar usuário')
  })

  it('o detalhe mostra o ID do Keycloak com botão de copiar', async () => {
    const copiar = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText: copiar } })
    const wrapper = await montar()

    await wrapper.findAll('tbody tr')[1].trigger('click')
    expect(wrapper.find('.id-usuario code').text()).toBe('u-maria')

    await wrapper.find('.btn-copiar-id').trigger('click')
    await flushPromises()
    expect(copiar).toHaveBeenCalledWith('u-maria')
    expect(wrapper.find('.btn-copiar-id').text()).toBe('✓ Copiado')
    vi.unstubAllGlobals()
  })

  it('clicar de novo na linha fecha o detalhe', async () => {
    const wrapper = await montar()
    const linha = wrapper.findAll('tbody tr')[0]

    await linha.trigger('click')
    expect(wrapper.find('.linha-detalhe').exists()).toBe(true)
    await linha.trigger('click')
    expect(wrapper.find('.linha-detalhe').exists()).toBe(false)
  })

  it('procurar filtra a lista sem chamar o backend de novo', async () => {
    const wrapper = await montar()

    await wrapper.find('.controle-busca input').setValue('silva')

    const linhas = wrapper.findAll('tbody tr')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].text()).toContain('maria')
    expect(buscarUsuarios).toHaveBeenCalledTimes(1)
  })

  it('clicar no cabeçalho inverte a ordem', async () => {
    const wrapper = await montar()
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('admin')

    await wrapper.findAll('th.col-ordenavel')[0].trigger('click')

    expect(wrapper.findAll('tbody tr')[0].text()).toContain('maria')
  })

  it('pagina conforme os registros por página', async () => {
    const wrapper = await montar()

    await wrapper.find('.controle-tamanho select').setValue(10)
    expect(wrapper.find('.rodape-lista').text()).toContain('Mostrando 1 a 2 de 2 registros')
  })

  it('voltar à lista sai do formulário sem salvar', async () => {
    const wrapper = await montar()
    await wrapper.find('.btn-primario').trigger('click')
    expect(wrapper.find('form.formulario-usuario').exists()).toBe(true)

    const voltar = wrapper.findAll('button').find((b) => b.text() === 'Voltar à lista')
    await voltar.trigger('click')

    expect(wrapper.find('form.formulario-usuario').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(criarUsuario).not.toHaveBeenCalled()
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

  it('ativo aparece como joinha para cima ou para baixo', async () => {
    buscarUsuarios.mockResolvedValue([USUARIOS[0], { ...USUARIOS[1], ativo: false }])
    const wrapper = await montar()

    const [admin, maria] = wrapper.findAll('.icone-status')
    expect(admin.attributes('aria-label')).toBe('Ativo')
    expect(maria.attributes('aria-label')).toBe('Inativo')
    expect(admin.find('svg').exists()).toBe(true)
  })

  it('exportar CSV baixa userDatagis_<data>.csv com os usuários da lista', async () => {
    const criarUrl = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { createObjectURL: criarUrl, revokeObjectURL: vi.fn() })
    let nomeBaixado = ''
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      nomeBaixado = this.download
    })
    const wrapper = await montar()

    await botao(wrapper, 'Exportar').trigger('click')
    await wrapper.find('.menu-exportar-lista button').trigger('click')

    const texto = await criarUrl.mock.calls[0][0].text()
    expect(texto).toContain('admin,Admin,(teste),admin@datagis.local,administrador')
    expect(texto.split('\r\n')[1].endsWith(',Sim')).toBe(true)
    expect(texto).toContain('maria,Maria,Silva')
    expect(nomeBaixado).toMatch(/^userDatagis_\d{2}-\d{2}-\d{4}\.csv$/)
    expect(wrapper.find('.menu-exportar-lista').exists()).toBe(false)
    clicar.mockRestore()
    vi.unstubAllGlobals()
  })

  it('exportar PDF gera o relatório e salva com o nome userDatagis_<data>.pdf', async () => {
    const save = vi.fn()
    gerarPdfUsuarios.mockResolvedValue({ save })
    const wrapper = await montar()

    await botao(wrapper, 'Exportar').trigger('click')
    await wrapper.findAll('.menu-exportar-lista button')[1].trigger('click')
    await flushPromises()

    expect(gerarPdfUsuarios).toHaveBeenCalledWith(USUARIOS, expect.any(Function))
    expect(save).toHaveBeenCalledWith(expect.stringMatching(/^userDatagis_\d{2}-\d{2}-\d{4}\.pdf$/))
  })

  it('não tem mais o botão Atualizar', async () => {
    const wrapper = await montar()
    expect(wrapper.findAll('button').some((b) => b.text() === 'Atualizar')).toBe(false)
  })

  it('importa só as linhas válidas e mostra o resultado de cada uma', async () => {
    criarUsuario.mockRejectedValueOnce(new Error('E-mail já usado no Keycloak'))
    const wrapper = await montar()
    await botao(wrapper, 'Importação em Massa de Usuário').trigger('click')

    await escolherArquivo(
      wrapper,
      [
        'login,nome,sobrenome,email,senha_temporaria,perfis,permissoes_avulsas',
        'joao,João,Souza,joao@x.com,Senha@123,Administrador,lote:gerenciar',
        'admin,Outro,Admin,o@x.com,Senha@123,,',
        'ana,Ana,Lima,ana@x.com,Senha@123,,',
      ].join('\n'),
    )

    expect(wrapper.find('.resumo-importacao').text()).toContain('2 pronta(s)')
    expect(wrapper.find('.tabela-importacao').text()).toContain('login já cadastrado')

    await botao(wrapper, 'Importar 2').trigger('click')
    await flushPromises()

    expect(criarUsuario).toHaveBeenCalledTimes(2)
    expect(criarUsuario).toHaveBeenNthCalledWith(1, {
      login: 'joao',
      nome: 'João',
      sobrenome: 'Souza',
      email: 'joao@x.com',
      senhaTemporaria: 'Senha@123',
      roles: ['perfil-administrador', 'lote:gerenciar'],
    })
    const tabela = wrapper.find('.tabela-importacao').text()
    expect(tabela).toContain('E-mail já usado no Keycloak')
    expect(tabela).toContain('✓ Cadastrado')
    expect(wrapper.find('.modal-footer').text()).toContain('1 de 2 importado(s)')
    // recarrega a lista depois de importar
    expect(buscarUsuarios).toHaveBeenCalledTimes(2)
  })

  it('arquivo sem o cabeçalho do modelo não deixa importar', async () => {
    const wrapper = await montar()
    await botao(wrapper, 'Importação em Massa de Usuário').trigger('click')

    await escolherArquivo(wrapper, 'usuario;senha\nx;y')

    expect(wrapper.find('.modal-body .alerta--erro').text()).toContain('Faltam colunas')
    expect(botao(wrapper, 'Importar 0').attributes('disabled')).toBeDefined()
    expect(criarUsuario).not.toHaveBeenCalled()
  })

  it('cadastra enviando perfis e só as avulsas que o perfil não cobre', async () => {
    const wrapper = await montar()
    await wrapper.find('.btn-primario').trigger('click')

    const campos = wrapper.findAll('.formulario-usuario input.campo-texto')
    await campos[0].setValue('joao')
    await campos[1].setValue('João')
    await campos[2].setValue('Souza')
    await campos[3].setValue('joao@x.com')
    await campos[4].setValue('Senha@123')
    await wrapper.find('input[value="perfil-administrador"]').setValue(true)
    await wrapper.find('input[value="lote:gerenciar"]').setValue(true)
    await wrapper.find('form.formulario-usuario').trigger('submit')
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

  it('o formulário de edição não tem mais o campo Ativo (fica no botão da lista)', async () => {
    const wrapper = await montar()
    await wrapper.findAll('tbody tr')[1].find('button').trigger('click')

    const rotulos = wrapper.findAll('.rotulo-form').map((r) => r.text())
    expect(rotulos).not.toContain('Ativo')
    expect(wrapper.find('.formulario-usuario input[type="checkbox"]:not([value])').exists()).toBe(false)
  })

  it('edição que mexe só nos acessos não regrava os dados', async () => {
    const wrapper = await montar()
    await wrapper.findAll('tbody tr')[1].find('button').trigger('click')

    await wrapper.find('input[value="lote:gerenciar"]').setValue(false)
    await wrapper.find('form.formulario-usuario').trigger('submit')
    await flushPromises()

    expect(definirRoles).toHaveBeenCalledWith('u-maria', [])
    expect(atualizarUsuario).not.toHaveBeenCalled()
  })

  it('edição que mexe só nos dados não regrava os acessos', async () => {
    const wrapper = await montar()
    await wrapper.findAll('tbody tr')[1].find('button').trigger('click')

    await wrapper.find('#campo-sobrenome').setValue('Souza')
    await wrapper.find('form.formulario-usuario').trigger('submit')
    await flushPromises()

    expect(atualizarUsuario).toHaveBeenCalledWith('u-maria', {
      nome: 'Maria',
      sobrenome: 'Souza',
      email: 'maria@x.com',
      ativo: true,
    })
    expect(definirRoles).not.toHaveBeenCalled()
  })

  it('salvar sem mudar nada não chama o backend e avisa', async () => {
    const wrapper = await montar()
    await wrapper.findAll('tbody tr')[0].find('button').trigger('click')

    await wrapper.find('form.formulario-usuario').trigger('submit')
    await flushPromises()

    expect(atualizarUsuario).not.toHaveBeenCalled()
    expect(definirRoles).not.toHaveBeenCalled()
    expect(wrapper.find('.alerta--info').text()).toBe('Nenhuma alteração para salvar.')
    expect(wrapper.find('form.formulario-usuario').exists()).toBe(true)
  })
})

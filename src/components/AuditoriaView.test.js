import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AuditoriaView from './AuditoriaView.vue'
import { buscarLogAuditoria } from '../services/auditoriaService'
import { buscarUsuarios } from '../services/usuarioService'

vi.mock('../services/auditoriaService', () => ({ buscarLogAuditoria: vi.fn() }))
const permissoes = vi.hoisted(() => ({ lista: ['usuario:gerenciar'] }))
vi.mock('../auth/autenticacao', () => ({
  nomeDoPerfil: (c) => c.replace('perfil-', ''),
  temPermissao: (p) => permissoes.lista.includes(p),
}))
vi.mock('../services/usuarioService', () => ({ buscarUsuarios: vi.fn() }))

const PAGINA = {
  total: 2,
  pagina: 0,
  tamanho: 50,
  itens: [
    {
      id: 2,
      dataHora: '2026-10-13T20:00:00Z',
      usuarioLogin: 'maria',
      perfis: 'perfil-analista',
      metodo: 'POST',
      rota: '/api/quarentena/lotes/45/liberar',
      acao: 'Liberar lote para a Silver',
      statusHttp: 403,
      sucesso: false,
      duracaoMs: 4,
      ipOrigem: '172.18.0.5',
    },
    {
      id: 1,
      dataHora: '2026-10-13T19:00:00Z',
      usuarioLogin: 'operador',
      perfis: 'perfil-operador',
      metodo: 'POST',
      rota: '/api/fontes/3/executar',
      acao: 'Executar ingestao da fonte',
      statusHttp: 200,
      sucesso: true,
      duracaoMs: 1520,
      ipOrigem: '172.18.0.5',
    },
  ],
}

beforeEach(() => {
  permissoes.lista = ['usuario:gerenciar']
  buscarLogAuditoria.mockResolvedValue(PAGINA)
  buscarUsuarios.mockResolvedValue([{ id: '2bd6783c-ca9e-4a13-bd19-2db003ef47d2', login: 'maria' }])
})
afterEach(() => vi.clearAllMocks())

describe('AuditoriaView', () => {
  it('lista quem fez o quê, com o resultado legível', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    const linhas = wrapper.findAll('tbody tr')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].text()).toContain('maria')
    expect(linhas[0].text()).toContain('Liberar lote para a Silver')
    expect(linhas[0].text()).toContain('Acesso negado')
    expect(linhas[1].text()).toContain('Sucesso')
    expect(linhas[1].text()).toContain('1520 ms')
  })

  it('não tem nenhum botão de editar ou apagar registro', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    // o único botão de cada linha é o de ver o JSON
    const botoes = wrapper.findAll('tbody button')
    expect(botoes.map((b) => b.text())).toEqual(['{ }', '{ }'])
  })

  it('abre o registro em JSON, só com copiar', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.findAll('tbody .btn-json')[0].trigger('click')

    const janela = wrapper.find('.json-janela')
    expect(janela.find('.json-titulo').text()).toBe('Registro #2')
    expect(janela.find('.json-conteudo').text()).toContain('"acao": "Liberar lote para a Silver"')
    expect(janela.find('.json-conteudo').html()).toContain('json-chave')
    expect(janela.findAll('button').map((b) => b.text())).toEqual(['Copiar', '✕'])

    await janela.find('.json-fechar').trigger('click')
    expect(wrapper.find('.json-janela').exists()).toBe(false)
  })

  it('o JSON escapa HTML vindo do registro', async () => {
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, itens: [{ ...PAGINA.itens[0], acao: '<img src=x onerror=alert(1)>' }] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.find('tbody .btn-json').trigger('click')

    expect(wrapper.find('.json-conteudo img').exists()).toBe(false)
    expect(wrapper.find('.json-conteudo').text()).toContain('<img src=x onerror=alert(1)>')
  })

  it('ver JSON do filtro busca todas as páginas do filtro aplicado', async () => {
    const registro = (id) => ({ ...PAGINA.itens[1], id })
    buscarLogAuditoria.mockImplementation(async (filtros, pagina, tamanho) =>
      tamanho === 50
        ? { total: 250, pagina, tamanho, itens: [registro(1)] }
        : { total: 250, pagina, tamanho, itens: Array.from({ length: pagina === 0 ? 200 : 50 }, (_, i) => registro(pagina * 200 + i)) },
    )
    const wrapper = mount(AuditoriaView)
    await flushPromises()
    await wrapper.find('input[placeholder="login"]').setValue('operador')
    await wrapper.find('form.filtros').trigger('submit')
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'Ver JSON do filtro').trigger('click')
    await flushPromises()

    expect(buscarLogAuditoria).toHaveBeenCalledWith(expect.objectContaining({ usuario: 'operador' }), 0, 200)
    expect(buscarLogAuditoria).toHaveBeenCalledWith(expect.objectContaining({ usuario: 'operador' }), 1, 200)
    const json = JSON.parse(wrapper.find('.json-conteudo').text())
    expect(json.totalEncontrado).toBe(250)
    expect(json.registros).toHaveLength(250)
    expect(json.filtros).toEqual({ usuario: 'operador' })
  })


  it('filtra enviando os campos preenchidos e volta pra primeira página', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.find('input[placeholder="login"]').setValue('maria')
    await wrapper.findAll('select')[1].setValue('false')
    await wrapper.find('form.filtros').trigger('submit')
    await flushPromises()

    expect(buscarLogAuditoria).toHaveBeenLastCalledWith(
      expect.objectContaining({ usuario: 'maria', sucesso: 'false' }),
      0,
      50,
    )
  })

  const ACAO_EM_USUARIO = {
    ...PAGINA.itens[1],
    id: 9,
    metodo: 'PUT',
    rota: '/api/admin/usuarios/2bd6783c-ca9e-4a13-bd19-2db003ef47d2/roles',
    acao: 'Alterar perfis e permissoes do usuario',
  }

  it('ação em usuário mostra o login de quem foi alterado', async () => {
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [ACAO_EM_USUARIO] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(wrapper.find('.usuario-alvo').text()).toBe('Usuário alterado: maria')
  })

  it('sem usuario:gerenciar (Auditor) não busca a lista e mostra o id', async () => {
    permissoes.lista = ['auditoria:visualizar']
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [ACAO_EM_USUARIO] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(buscarUsuarios).not.toHaveBeenCalled()
    expect(wrapper.find('.usuario-alvo').text()).toContain('ID 2bd6783c-ca9e-4a13-bd19-2db003ef47d2')
  })

  it('ação que não é em usuário não mostra a linha', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()
    expect(wrapper.find('.usuario-alvo').exists()).toBe(false)
  })

  const COM_MUDANCA = {
    ...PAGINA.itens[1],
    id: 20,
    metodo: 'PUT',
    rota: '/api/admin/usuarios/2bd6783c-ca9e-4a13-bd19-2db003ef47d2',
    acao: 'Editar dados do usuario',
    dadosAntes: '{"login":"maria","email":"maria@a.com","ativo":true,"perfis":["perfil-auditor"]}',
    dadosDepois: '{"login":"maria","email":"maria@b.com","ativo":false,"perfis":["perfil-auditor"]}',
  }

  it('a linha avisa quantos campos mudaram', async () => {
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [COM_MUDANCA] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(wrapper.find('.badge-mudanca').text()).toBe('2 campo(s) alterado(s)')
  })

  it('a janela mostra antes e depois com só os campos alterados em vermelho', async () => {
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [COM_MUDANCA] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.find('tbody .btn-json').trigger('click')

    const [antes, depois] = wrapper.findAll('.lado')
    expect(antes.find('.lado-titulo').text()).toBe('Antes')
    const alteradasAntes = antes.findAll('.linha-campo--alterada').map((l) => l.text())
    expect(alteradasAntes).toEqual(['"email": "maria@a.com"', '"ativo": true'])
    const alteradasDepois = depois.findAll('.linha-campo--alterada').map((l) => l.text())
    expect(alteradasDepois).toEqual(['"email": "maria@b.com"', '"ativo": false'])
    // login e perfis não mudaram: aparecem sem destaque
    expect(depois.findAll('.linha-campo').map((l) => l.text())).toContain('"perfis": ["perfil-auditor"]')
    // no JSON completo o antes/depois vem como objeto, não como texto escapado
    expect(wrapper.find('.json-conteudo').text()).toContain('"email": "maria@a.com"')
  })

  it('cadastro novo mostra que antes não existia', async () => {
    const novo = { ...COM_MUDANCA, metodo: 'POST', dadosAntes: null, dadosDepois: '{"login":"joao"}' }
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [novo] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(wrapper.find('.badge-mudanca').text()).toBe('Cadastro novo')
    await wrapper.find('tbody .btn-json').trigger('click')
    expect(wrapper.find('.lado-vazio').text()).toContain('Não existia')
  })

  it('registro sem antes/depois não mostra a seção', async () => {
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    expect(wrapper.find('.badge-mudanca').exists()).toBe(false)
    await wrapper.find('tbody .btn-json').trigger('click')
    expect(wrapper.find('.antes-depois').exists()).toBe(false)
  })

  it('valor vindo do antes/depois é escapado', async () => {
    const perigoso = { ...COM_MUDANCA, dadosDepois: '{"login":"maria","email":"<img src=x onerror=alert(1)>"}' }
    buscarLogAuditoria.mockResolvedValue({ ...PAGINA, total: 1, itens: [perigoso] })
    const wrapper = mount(AuditoriaView)
    await flushPromises()

    await wrapper.find('tbody .btn-json').trigger('click')
    expect(wrapper.find('.lados img').exists()).toBe(false)
  })
})

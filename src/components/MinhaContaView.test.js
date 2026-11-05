import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MinhaContaView from './MinhaContaView.vue'
import { buscarMinhaConta, salvarNome, trocarSenha } from '../services/minhaContaService'

vi.mock('../services/minhaContaService', () => ({
  buscarMinhaConta: vi.fn(),
  salvarNome: vi.fn(),
  trocarSenha: vi.fn(),
}))

const { sessaoTeste } = vi.hoisted(() => ({ sessaoTeste: { login: 'maria', nome: 'Maria Silva' } }))
vi.mock('../auth/autenticacao', () => ({
  sessao: sessaoTeste,
  nomeDoPerfil: (c) => (c === 'perfil-analista' ? 'Analista' : c),
}))

const CONTA = {
  id: 'u1',
  login: 'maria',
  nome: 'Maria',
  sobrenome: 'Silva',
  email: 'maria@x.com',
  ativo: true,
  criadoEm: '2026-10-25T18:13:12Z',
  perfis: ['perfil-analista'],
  tokenAcessoHabilitado: false,
}

async function montar() {
  const wrapper = mount(MinhaContaView)
  await flushPromises()
  return wrapper
}

const formSenha = (w) => w.find('form[aria-label="Trocar senha"]')
const camposSenha = (w) => formSenha(w).findAll('input[type="password"]')

beforeEach(() => {
  sessaoTeste.nome = 'Maria Silva'
  buscarMinhaConta.mockResolvedValue({ ...CONTA })
  salvarNome.mockResolvedValue({ ...CONTA, nome: 'Maria Clara', sobrenome: 'Souza' })
  trocarSenha.mockResolvedValue(null)
})

afterEach(() => vi.clearAllMocks())

describe('MinhaContaView', () => {
  it('nome e sobrenome são editáveis; login, e-mail, perfis e situação só aparecem', async () => {
    const wrapper = await montar()
    const dados = wrapper.find('form[aria-label="Dados da conta"]')

    expect(dados.findAll('input')).toHaveLength(2)
    expect(dados.find('[data-campo="login"]').text()).toBe('maria')
    expect(dados.find('[data-campo="email"]').text()).toBe('maria@x.com')
    expect(dados.find('[data-campo="perfis"]').text()).toBe('Analista')
    expect(dados.find('[data-campo="situacao"]').text()).toContain('Ativo')
  })

  it('Salvar nome só habilita depois de mudar o nome', async () => {
    const wrapper = await montar()
    const salvar = wrapper.findAll('button').find((b) => b.text() === 'Salvar nome')

    expect(salvar.attributes('disabled')).toBeDefined()
    await wrapper.findAll('form[aria-label="Dados da conta"] input')[1].setValue('Souza')
    expect(salvar.attributes('disabled')).toBeUndefined()
  })

  it('salvar o nome grava e já atualiza o nome do menu', async () => {
    const wrapper = await montar()
    const [nome, sobrenome] = wrapper.findAll('form[aria-label="Dados da conta"] input')
    await nome.setValue(' Maria Clara ')
    await sobrenome.setValue('Souza')

    await wrapper.find('form[aria-label="Dados da conta"]').trigger('submit')
    await flushPromises()

    expect(salvarNome).toHaveBeenCalledWith('Maria Clara', 'Souza')
    expect(sessaoTeste.nome).toBe('Maria Clara Souza')
    expect(wrapper.find('.alerta-sucesso').text()).toContain('Nome atualizado')
  })

  it('troca a senha e limpa os campos', async () => {
    const wrapper = await montar()
    const [atual, nova, confirmacao] = camposSenha(wrapper)
    await atual.setValue('Atual@2026')
    await nova.setValue('Nova@2026x')
    await confirmacao.setValue('Nova@2026x')

    await formSenha(wrapper).trigger('submit')
    await flushPromises()

    expect(trocarSenha).toHaveBeenCalledWith('Atual@2026', 'Nova@2026x')
    expect(camposSenha(wrapper).map((c) => c.element.value)).toEqual(['', '', ''])
  })

  it('confirmação diferente não chama o backend', async () => {
    const wrapper = await montar()
    const [atual, nova, confirmacao] = camposSenha(wrapper)
    await atual.setValue('Atual@2026')
    await nova.setValue('Nova@2026x')
    await confirmacao.setValue('Outra@2026')

    expect(formSenha(wrapper).find('.texto-erro').exists()).toBe(true)
    await formSenha(wrapper).trigger('submit')
    await flushPromises()

    expect(trocarSenha).not.toHaveBeenCalled()
    expect(formSenha(wrapper).find('.alerta-erro').text()).toContain('confirmação')
  })

  it('senha atual errada mostra o erro do backend', async () => {
    trocarSenha.mockRejectedValue(new Error('Senha atual incorreta'))
    const wrapper = await montar()
    const [atual, nova, confirmacao] = camposSenha(wrapper)
    await atual.setValue('errada')
    await nova.setValue('Nova@2026x')
    await confirmacao.setValue('Nova@2026x')

    await formSenha(wrapper).trigger('submit')
    await flushPromises()

    expect(formSenha(wrapper).find('.alerta-erro').text()).toContain('Senha atual incorreta')
  })

  it('o token de acesso só mostra o estado e avisa que vem em breve', async () => {
    buscarMinhaConta.mockResolvedValue({ ...CONTA, perfis: ['perfil-administrador'], tokenAcessoHabilitado: true })
    const wrapper = await montar()
    const interruptor = wrapper.find('[role="switch"]')

    expect(interruptor.attributes('aria-checked')).toBe('true')
    expect(interruptor.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.selo-em-breve').text()).toBe('Disponível em breve')
    expect(wrapper.find('.texto-token').text()).toBe('Liberado pelo administrador')
  })

  it('quem não é Administrador não vê o token', async () => {
    const wrapper = await montar()

    expect(wrapper.find('section[aria-label="Token de acesso"]').exists()).toBe(false)
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
  })

  it('falha ao carregar mostra o erro', async () => {
    buscarMinhaConta.mockRejectedValue(new Error('Falha ao carregar os seus dados'))
    const wrapper = await montar()

    expect(wrapper.find('.alerta-erro').text()).toContain('Falha ao carregar')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

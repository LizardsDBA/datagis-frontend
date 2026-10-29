import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PesquisaTelas from './PesquisaTelas.vue'
import { destacarNaTela } from '../navegacao/pesquisa'

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../auth/autenticacao', () => ({ temPermissao: () => true }))
vi.mock('../navegacao/pesquisa', async (original) => ({
  ...(await original()),
  destacarNaTela: vi.fn(),
}))

beforeEach(() => {
  push.mockReset().mockResolvedValue()
  vi.mocked(destacarNaTela).mockClear()
})

async function digitar(wrapper, texto) {
  const campo = wrapper.find('input')
  await campo.trigger('focus')
  await campo.setValue(texto)
}

describe('PesquisaTelas', () => {
  it('fica no topo, com placeholder explicando o que pesquisa', () => {
    const wrapper = mount(PesquisaTelas)
    expect(wrapper.find('input').attributes('placeholder')).toBe('Pesquisar tela ou botão')
    expect(wrapper.find('.pesquisa-lista').exists()).toBe(false)
  })

  it('mostra telas e botões encontrados', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'gold')

    const itens = wrapper.findAll('.pesquisa-item')
    expect(itens.some((i) => i.text().includes('Migrar para Gold') && i.text().includes('Botão'))).toBe(true)
  })

  it('cada resultado tem o ícone da tela na frente, na cor dela', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'migrar para gold')

    const item = wrapper.find('.pesquisa-item')
    const icone = item.element.firstElementChild
    expect(icone.classList.contains('pesquisa-icone-tela')).toBe(true)
    expect(icone.querySelector('svg')).not.toBeNull()
    expect(icone.getAttribute('style')).toContain('background')
  })

  it('avisa quando não encontra nada', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'nada parecido com isso')

    expect(wrapper.find('.pesquisa-vazio').text()).toBe('Nada encontrado.')
  })

  it('clicar numa tela abre a tela e limpa o campo', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'quarentena')
    await wrapper.find('.pesquisa-item').trigger('mousedown')
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/quarentena')
    expect(destacarNaTela).not.toHaveBeenCalled()
    expect(wrapper.find('input').element.value).toBe('')
    expect(wrapper.emitted('navegou')).toHaveLength(1)
  })

  it('escolher um botão abre a tela dele e destaca o botão', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'migrar para gold')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/lotes')
    expect(destacarNaTela).toHaveBeenCalledWith('Migrar para Gold')
  })

  it('seta para baixo escolhe o próximo resultado', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'indicadores')
    const campo = wrapper.find('input')
    await campo.trigger('keydown', { key: 'ArrowDown' })

    expect(wrapper.findAll('.pesquisa-item')[1].classes()).toContain('pesquisa-item--ativo')
  })

  it('Esc limpa a pesquisa', async () => {
    const wrapper = mount(PesquisaTelas)
    await digitar(wrapper, 'fontes')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('input').element.value).toBe('')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LotesView from './LotesView.vue'
import { buscarLotes, liberarLote, descartarLote } from '../services/loteService'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../services/loteService', () => ({
  buscarLotes: vi.fn(),
  liberarLote: vi.fn(),
  descartarLote: vi.fn(),
}))

vi.mock('../auth/autenticacao', () => ({
  temPermissao: () => () => true,
}))

describe('LotesView.vue - Liberação e Quarentena', () => {
  let wrapper

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('exibe modal de confirmação com aviso de revalidação e bloqueio se houver erro', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 42,
        fonteDadoNome: 'CAR Teste',
        status: 'RETIDO_QUARENTENA',
        quantidadeRegistros: 10,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])

    wrapper = mount(LotesView)
    await flushPromises()

    // Clica no botão de liberar
    const btnLiberar = wrapper.find('.btn-liberar')
    expect(btnLiberar.exists()).toBe(true)
    await btnLiberar.trigger('click')

    // Modal aberta
    expect(wrapper.text()).toContain('Enviar o lote #42 para a Silver?')
    expect(wrapper.text()).toContain('Revalidação Completa do Lote')
    expect(wrapper.text()).toContain('Se algum item ainda contiver erro, a liberação será bloqueada')
  })

  it('ao falhar a liberação por erro de validação, exibe aviso de bloqueio e atalho para Quarentena', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 42,
        fonteDadoNome: 'CAR Teste',
        status: 'RETIDO_QUARENTENA',
        quantidadeRegistros: 10,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])
    liberarLote.mockRejectedValue(new Error('O lote #42 não pode ser liberado para a Silver: 2 registro(s) ainda contêm erro(s) após a revalidação.'))

    wrapper = mount(LotesView)
    await flushPromises()

    // Abre modal
    await wrapper.find('.btn-liberar').trigger('click')

    // Confirma liberação
    const btnConfirmar = wrapper.find('.btn-confirmar-liberar')
    await btnConfirmar.trigger('click')
    await flushPromises()

    // Deve exibir fase de erro
    expect(wrapper.text()).toContain('LIBERAÇÃO BLOQUEADA')
    expect(wrapper.text()).toContain('Lote #42 Retido na Quarentena')
    expect(wrapper.text()).toContain('2 registro(s) ainda contêm erro(s)')

    // Atalho para quarentena
    const btnAtalhoQuarentena = wrapper.find('.btn-atalho-quarentena')
    expect(btnAtalhoQuarentena.exists()).toBe(true)
    await btnAtalhoQuarentena.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({
      path: '/quarentena',
      query: { loteId: 42 },
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LotesView from './LotesView.vue'
import { buscarLotes, liberarLote, descartarLote } from '../services/loteService'
import { publicarGold, obterStatusGold } from '../services/goldService'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../services/loteService', () => ({
  buscarLotes: vi.fn(),
  liberarLote: vi.fn(),
  descartarLote: vi.fn(),
}))

vi.mock('../services/goldService', () => ({
  publicarGold: vi.fn(),
  obterStatusGold: vi.fn(),
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

  it('exibe botão de migração para Gold no cabeçalho quando há lotes em PROMOVIDO_SILVER', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 10,
        fonteDadoNome: 'CAR Homologado',
        status: 'PROMOVIDO_SILVER',
        quantidadeRegistros: 100,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])

    wrapper = mount(LotesView)
    await flushPromises()

    const btnTopoGold = wrapper.find('.btn-migrar-gold')
    expect(btnTopoGold.exists()).toBe(true)
    expect(btnTopoGold.text()).toContain('Migrar para Gold')
    expect(btnTopoGold.text()).toContain('1 na Silver')

    expect(wrapper.find('.btn-acao--gold').exists()).toBe(false)
    const concluido = wrapper.find('.texto-concluido')
    expect(concluido.exists()).toBe(true)
    expect(concluido.text()).toContain('Disponível na Silver')
  })

  it('abre modal consolidado de confirmação de migração para Gold com detalhes dos indicadores e camadas', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 10,
        fonteDadoNome: 'CAR Homologado',
        status: 'PROMOVIDO_SILVER',
        quantidadeRegistros: 100,
        criadoEm: '2026-10-18T10:00:00Z',
      },
      {
        id: 20,
        fonteDadoNome: 'IBAMA Embargos',
        status: 'PROMOVIDO_SILVER',
        quantidadeRegistros: 50,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])

    wrapper = mount(LotesView)
    await flushPromises()

    await wrapper.find('.btn-migrar-gold').trigger('click')

    expect(wrapper.text()).toContain('TRANSIÇÃO SILVER → GOLD')
    expect(wrapper.text()).toContain('Publicação Consolidada na Camada Gold')
    expect(wrapper.text()).toContain('ISAP, IAE, IRL, IAPP, IDesmat, IFC e ICV')
    expect(wrapper.text()).toContain('2 lote(s)')
    expect(wrapper.text()).toContain('6 camadas')
  })

  it('executa a migração para a Gold com sucesso via botão único e exibe o resumo de publicação', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 10,
        fonteDadoNome: 'CAR Homologado',
        status: 'PROMOVIDO_SILVER',
        quantidadeRegistros: 100,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])
    publicarGold.mockResolvedValue({
      totalImoveis: 100,
      imoveisPublicados: 100,
      imoveisComFalha: [],
      camadasPublicadas: ['IMOVEL_RURAL', 'MUNICIPIO'],
      camadasComFalha: [],
    })

    wrapper = mount(LotesView)
    await flushPromises()

    // Abre modal pelo botão do topo
    await wrapper.find('.btn-migrar-gold').trigger('click')

    // Confirma publicação
    const btnConfirmar = wrapper.find('.btn-confirmar-gold')
    await btnConfirmar.trigger('click')
    await flushPromises()

    expect(publicarGold).toHaveBeenCalledWith()
    expect(wrapper.text()).toContain('PUBLICAÇÃO CONCLUÍDA')
    expect(wrapper.text()).toContain('Migração para a Gold Finalizada')
    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).toContain('Publicados com Sucesso')
  })

  it('renderiza corretamente lote com status PROMOVIDO_GOLD já existente', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 20,
        fonteDadoNome: 'CAR Homologado Final',
        status: 'PROMOVIDO_GOLD',
        quantidadeRegistros: 200,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])

    wrapper = mount(LotesView)
    await flushPromises()

    const cardGold = wrapper.find('.card-metrica--gold')
    expect(cardGold.exists()).toBe(true)
    expect(cardGold.text()).toContain('Migrados para Gold')
    expect(cardGold.text()).toContain('1')

    const badgeGold = wrapper.find('.badge--gold')
    expect(badgeGold.exists()).toBe(true)
    expect(badgeGold.text()).toContain('Migrado para Gold')

    const concluido = wrapper.find('.texto-concluido--gold')
    expect(concluido.exists()).toBe(true)
    expect(concluido.text()).toContain('Publicado na Gold')
  })

  it('ao falhar a migração para Gold, exibe fase de erro com mensagem de falha', async () => {
    buscarLotes.mockResolvedValue([
      {
        id: 10,
        fonteDadoNome: 'CAR Homologado',
        status: 'PROMOVIDO_SILVER',
        quantidadeRegistros: 100,
        criadoEm: '2026-10-18T10:00:00Z',
      },
    ])
    publicarGold.mockRejectedValue(new Error('Conexão com o banco Oracle interrompida.'))

    wrapper = mount(LotesView)
    await flushPromises()

    // Abre modal e confirma
    await wrapper.find('.btn-migrar-gold').trigger('click')
    await wrapper.find('.btn-confirmar-gold').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('FALHA NA MIGRAÇÃO')
    expect(wrapper.text()).toContain('Conexão com o banco Oracle interrompida.')

    const btnTentarNovamente = wrapper.find('.btn-confirmar-gold')
    expect(btnTentarNovamente.text()).toContain('Tentar Novamente')
  })
})


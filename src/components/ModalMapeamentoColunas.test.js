import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ModalMapeamentoColunas from './ModalMapeamentoColunas.vue'

// Sessão de mentira: com permissão de gerenciar fonte
vi.mock('../auth/autenticacao', () => ({
  temPermissao: () => true,
  obterToken: async () => 'fake-token',
  entrarNovamente: () => {},
}))

const {
  mockMapeamentos,
  mockAtualizarEntidadeSilver,
  mockLimparTodosMapeamentos,
  mockSalvarMapeamentos,
} = vi.hoisted(() => ({
  mockMapeamentos: [
    {
      id: 101,
      colunaOrigem: 'cod_imovel',
      atributoDestino: 'cod_imovel',
      destinoTipo: 'COLUNA',
      tipoDado: 'texto',
      obrigatorio: true,
      tabelaDestino: 'imovel_rural',
    },
  ],
  mockAtualizarEntidadeSilver: vi.fn().mockResolvedValue({ id: 1, entidadeSilver: 'imovel_rural' }),
  mockLimparTodosMapeamentos: vi.fn().mockResolvedValue(true),
  mockSalvarMapeamentos: vi.fn().mockImplementation((fonteId, lista) => Promise.resolve(lista)),
}))

vi.mock('../services/quarentenaService', () => ({
  buscarMapeamentos: vi.fn().mockImplementation((fonteId) => {
    if (fonteId === 1 || fonteId === 5) return Promise.resolve([])
    return Promise.resolve([...mockMapeamentos])
  }),
  salvarMapeamentos: mockSalvarMapeamentos,
  excluirMapeamento: vi.fn().mockResolvedValue(true),
  limparTodosMapeamentosFonte: mockLimparTodosMapeamentos,
  buscarEsquemasSilver: vi.fn().mockResolvedValue([
    {
      id: 'imovel_rural',
      nome: 'Imóvel Rural (CAR)',
      descricao: 'Cadastro de imóveis rurais',
      colunas: [
        { nome: 'cod_imovel', label: 'Código do Imóvel', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
        { nome: 'situacao_imovel', label: 'Situação', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true, tabelaReferencia: 'situacao_imovel' },
        { nome: 'area_ha', label: 'Área (ha)', tipoDado: 'numero', destinoTipo: 'COLUNA', valorMinimo: 0 },
      ],
      dominios: [
        { tabela: 'situacao_imovel', label: 'situacao_imovel (AT, PE, CA...)' },
      ],
    },
    {
      id: 'embargo_ambiental',
      nome: 'Embargo Ambiental',
      descricao: 'Termos de embargo',
      colunas: [
        { nome: 'numero_termo', label: 'Número do Termo', tipoDado: 'texto', destinoTipo: 'COLUNA', obrigatorio: true },
      ],
      dominios: [
        { tabela: 'tipo_area_embargo', label: 'tipo_area_embargo (Desmatamento...)' },
      ],
    },
  ]),
  atualizarEntidadeSilverFonte: mockAtualizarEntidadeSilver,
}))

let wrapper

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.clearAllMocks()
})

describe('ModalMapeamentoColunas — Fluxo Guiado por Tabela Silver', () => {
  it('exibe aviso orientativo e oculta formulário e tabela quando a fonte não tem Tabela Silver definida', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 1, nome: 'Fonte Sem Silver', entidadeSilver: null },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('ETAPA 1')
    expect(wrapper.text()).toContain('Tabela Silver de Destino')
    expect(wrapper.text()).toContain('Selecione uma Tabela Silver para Iniciar o Mapeamento')
    expect(wrapper.find('.silver-orientacao-inicial').exists()).toBe(true)

    // Formulário (Etapa 2) e Tabela (Etapa 3) devem estar completamente ocultos
    expect(wrapper.find('.card-formulario').exists()).toBe(false)
    expect(wrapper.find('.secao-tabela').exists()).toBe(false)
  })

  it('desbloqueia o formulário e a tabela e carrega as colunas canônicas quando a fonte já possui Tabela Silver', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    expect(wrapper.find('.silver-orientacao-inicial').exists()).toBe(false)
    expect(wrapper.find('.card-formulario').exists()).toBe(true)
    expect(wrapper.find('.secao-tabela').exists()).toBe(true)
    expect(wrapper.text()).toContain('ETAPA 2')
    expect(wrapper.text()).toContain('Mapear Novo Campo')

    // Verifica que o select de atributos contém as colunas canônicas da Silver selecionada
    const selectAtributo = wrapper.find('.atributo-select-wrapper select')
    expect(selectAtributo.exists()).toBe(true)
    const options = selectAtributo.findAll('option')
    const textosOptions = options.map((o) => o.text())
    expect(textosOptions.some((t) => t.includes('cod_imovel'))).toBe(true)
    expect(textosOptions.some((t) => t.includes('situacao_imovel'))).toBe(true)
    expect(textosOptions.some((t) => t.includes('area_ha'))).toBe(true)
  })

  it('filtra as opções de validação de domínio apenas para a tabela Silver selecionada', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    const selectDominio = wrapper.findAll('.select-form').find((s) => s.text().includes('Nenhuma tabela de domínio'))
    expect(selectDominio).toBeDefined()
    expect(selectDominio.text()).toContain('situacao_imovel')
    expect(selectDominio.text()).not.toContain('tipo_area_embargo')
  })

  it('permite selecionar a tabela Silver inicialmente e salva via atualizarEntidadeSilverFonte', async () => {
    const fonte = { id: 5, nome: 'Nova Fonte', entidadeSilver: '' }

    wrapper = mount(ModalMapeamentoColunas, {
      props: { fonte },
    })
    await flushPromises()

    const selectSilver = wrapper.find('.select-silver-destaque')
    await selectSilver.setValue('imovel_rural')
    await selectSilver.trigger('change')
    await flushPromises()

    expect(mockAtualizarEntidadeSilver).toHaveBeenCalledWith(5, 'imovel_rural')
    expect(wrapper.find('.silver-orientacao-inicial').exists()).toBe(false)
    expect(wrapper.find('.card-formulario').exists()).toBe(true)
  })

  it('envia tabelaDestino preenchida ao salvar um mapeamento de coluna', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    // Preenche campos do formulário com coluna Silver ainda não mapeada
    const inputOrigem = wrapper.find('.card-formulario input[placeholder*="Ex: cod_municipio_ibge"]')
    await inputOrigem.setValue('sit_cadastral')

    const selectAtributo = wrapper.find('.atributo-select-wrapper select')
    await selectAtributo.setValue('situacao_imovel')
    await selectAtributo.trigger('change')

    // Submete o form
    await wrapper.find('.card-formulario form').trigger('submit')
    await flushPromises()

    expect(mockSalvarMapeamentos).toHaveBeenCalledTimes(1)
    const payloadEnviado = mockSalvarMapeamentos.mock.calls[0][1]
    expect(payloadEnviado[0]).toMatchObject({
      colunaOrigem: 'sit_cadastral',
      atributoDestino: 'situacao_imovel',
      tabelaDestino: 'imovel_rural',
      fonteDadoId: 2,
    })
  })

  it('desabilita opção de coluna Silver já mapeada e exibe pendências no card de prontidão', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    // 1. O card de prontidão deve mostrar que a ingestão está bloqueada e faltam colunas
    const cardProntidao = wrapper.find('.card-prontidao-ingestao')
    expect(cardProntidao.exists()).toBe(true)
    expect(cardProntidao.text()).toContain('Ingestão Bloqueada')
    expect(cardProntidao.text()).toContain('1 de 3 colunas da tabela Silver preenchidas')
    expect(cardProntidao.text()).toContain('situacao_imovel')
    expect(cardProntidao.text()).toContain('area_ha')

    // 2. No select de atributos, a coluna 'cod_imovel' já mapeada deve estar desabilitada
    const selectAtributo = wrapper.find('.atributo-select-wrapper select')
    const opcoes = selectAtributo.findAll('option')
    const optCodImovel = opcoes.find((o) => o.attributes('value') === 'cod_imovel')
    expect(optCodImovel).toBeDefined()
    expect(optCodImovel.attributes('disabled')).toBeDefined()
    expect(optCodImovel.text()).toContain('já mapeado')

    // 3. Coluna não mapeada ('situacao_imovel') deve estar habilitada
    const optSituacao = opcoes.find((o) => o.attributes('value') === 'situacao_imovel')
    expect(optSituacao.attributes('disabled')).toBeUndefined()
  })

  it('abre popup de confirmação e cancela a troca de Tabela Silver quando o usuário clica em Cancelar', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    const selectSilver = wrapper.find('.select-silver-destaque')
    await selectSilver.setValue('embargo_ambiental')
    await selectSilver.trigger('change')
    await flushPromises()

    // O popup deve estar aberto na tela
    const popupPerigo = wrapper.find('.popup-card--perigo')
    expect(popupPerigo.exists()).toBe(true)
    expect(popupPerigo.text()).toContain('Trocar Tabela Silver de Destino?')
    expect(popupPerigo.text()).toContain('todos os mapeamentos atuais serão excluídos permanentemente')

    // Clica no botão Cancelar do popup
    const btnCancelar = popupPerigo.find('.btn-popup-cancelar')
    await btnCancelar.trigger('click')
    await flushPromises()

    expect(wrapper.find('.popup-card--perigo').exists()).toBe(false)
    expect(mockLimparTodosMapeamentos).not.toHaveBeenCalled()
    expect(mockAtualizarEntidadeSilver).not.toHaveBeenCalled()

    // Seletor deve permanecer no valor anterior
    expect(wrapper.vm.tabelaSilverSelecionada).toBe('imovel_rural')
  })

  it('limpa mapeamentos existentes e atualiza a Tabela Silver quando o usuário confirma no popup', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    const selectSilver = wrapper.find('.select-silver-destaque')
    await selectSilver.setValue('embargo_ambiental')
    await selectSilver.trigger('change')
    await flushPromises()

    const popupPerigo = wrapper.find('.popup-card--perigo')
    expect(popupPerigo.exists()).toBe(true)

    // Clica no botão de confirmação do popup
    const btnConfirmar = popupPerigo.find('.btn-popup-confirmar--perigo')
    await btnConfirmar.trigger('click')
    await flushPromises()

    expect(mockLimparTodosMapeamentos).toHaveBeenCalledWith(2)
    expect(mockAtualizarEntidadeSilver).toHaveBeenCalledWith(2, 'embargo_ambiental')
    expect(wrapper.find('.popup-card--perigo').exists()).toBe(false)
    expect(wrapper.vm.tabelaSilverSelecionada).toBe('embargo_ambiental')
    expect(wrapper.vm.mapeamentos).toEqual([])
  })

  it('abre popup de confirmação ao clicar em excluir mapeamento e remove ao confirmar', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    const btnExcluir = wrapper.find('.btn-excluir')
    expect(btnExcluir.exists()).toBe(true)
    await btnExcluir.trigger('click')
    await flushPromises()

    // Popup de exclusão deve estar visível
    const popupExcluir = wrapper.find('.popup-icone-wrapper--lixeira')
    expect(popupExcluir.exists()).toBe(true)
    expect(wrapper.text()).toContain('Remover Mapeamento de Coluna')

    // Confirmar exclusão no popup
    const btnConfirmarExclusao = wrapper.findAll('.btn-popup-confirmar--perigo').find(b => b.text().includes('Remover Campo'))
    expect(btnConfirmarExclusao).toBeDefined()
    await btnConfirmarExclusao.trigger('click')
    await flushPromises()

    expect(wrapper.find('.popup-icone-wrapper--lixeira').exists()).toBe(false)
  })

  it('limpa mensagens de sucesso e erro ao fechar o modal ou trocar de fonte', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    // Simula mensagem de sucesso ativa
    wrapper.vm.sucesso = 'Tabela Silver definida como "Área Protegida" com sucesso!'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.alerta--sucesso').exists()).toBe(true)

    // Clica no botão fechar do modal
    const btnFechar = wrapper.find('.btn-fechar')
    await btnFechar.trigger('click')

    // Deve emitir fechar e limpar a mensagem de sucesso
    expect(wrapper.emitted('fechar')).toBeTruthy()
    expect(wrapper.vm.sucesso).toBeNull()

    // Ao mudar a prop fonte para outra fonte, mensagem permanece limpa
    await wrapper.setProps({
      fonte: { id: 3, nome: 'Outra Fonte', entidadeSilver: 'embargo_ambiental' },
    })
    await flushPromises()

    expect(wrapper.vm.sucesso).toBeNull()
    expect(wrapper.find('.alerta--sucesso').exists()).toBe(false)
  })

  it('não possui opção de atributo customizado ou outro no dropdown de destino', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    const selectAtributo = wrapper.find('.atributo-select-wrapper select')
    expect(selectAtributo.exists()).toBe(true)
    const options = selectAtributo.findAll('option')
    const valores = options.map((o) => o.attributes('value'))
    const textos = options.map((o) => o.text())

    expect(valores).not.toContain('__customizado__')
    expect(textos.some((t) => t.toLowerCase().includes('outro'))).toBe(false)
    expect(textos.some((t) => t.toLowerCase().includes('personalizado'))).toBe(false)
    expect(wrapper.find('.custom-atributo-wrapper').exists()).toBe(false)
    expect(wrapper.find('.btn-voltar-select').exists()).toBe(false)
  })
})

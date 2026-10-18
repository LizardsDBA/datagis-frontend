import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ModalMapeamentoColunas from './ModalMapeamentoColunas.vue'

// Sessão de mentira: com permissão de gerenciar fonte
vi.mock('../auth/autenticacao', () => ({
  temPermissao: () => true,
  obterToken: async () => 'fake-token',
  entrarNovamente: () => {},
}))

const { mockMapeamentos, mockAtualizarEntidadeSilver } = vi.hoisted(() => ({
  mockMapeamentos: [
    {
      id: 101,
      colunaOrigem: 'cod_imovel',
      atributoDestino: 'cod_imovel',
      destinoTipo: 'COLUNA',
      tipoDado: 'texto',
      obrigatorio: true,
    },
  ],
  mockAtualizarEntidadeSilver: vi.fn().mockResolvedValue({ id: 1, entidadeSilver: 'imovel_rural' }),
}))

vi.mock('../services/quarentenaService', () => ({
  buscarMapeamentos: vi.fn().mockImplementation(() => Promise.resolve(mockMapeamentos)),
  salvarMapeamentos: vi.fn().mockImplementation(() => Promise.resolve(mockMapeamentos)),
  excluirMapeamento: vi.fn().mockResolvedValue(true),
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
})

describe('ModalMapeamentoColunas — Fluxo Guiado por Tabela Silver', () => {
  it('exibe bloqueio de campos quando a fonte não tem Tabela Silver definida', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 1, nome: 'Fonte Sem Silver', entidadeSilver: null },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('ETAPA 1')
    expect(wrapper.text()).toContain('Tabela Silver de Destino')
    expect(wrapper.text()).toContain('Mapeamento de Campos Bloqueado')
    expect(wrapper.find('.bloqueio-aviso').exists()).toBe(true)
  })

  it('desbloqueia o formulário e carrega as colunas canônicas quando a fonte já possui Tabela Silver', async () => {
    wrapper = mount(ModalMapeamentoColunas, {
      props: {
        fonte: { id: 2, nome: 'CAR Imóveis', entidadeSilver: 'imovel_rural' },
      },
    })
    await flushPromises()

    expect(wrapper.find('.bloqueio-aviso').exists()).toBe(false)
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

    // O select de validação de domínio deve ter 'situacao_imovel' e NÃO ter domínios de embargo
    const selectDominio = wrapper.findAll('.select-form').find((s) => s.text().includes('Nenhuma tabela de domínio'))
    expect(selectDominio).toBeDefined()
    expect(selectDominio.text()).toContain('situacao_imovel')
    expect(selectDominio.text()).not.toContain('tipo_area_embargo')
  })

  it('permite selecionar a tabela Silver e persiste via atualizarEntidadeSilverFonte', async () => {
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
    expect(wrapper.find('.bloqueio-aviso').exists()).toBe(false)
  })
})

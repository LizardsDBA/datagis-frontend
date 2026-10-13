import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { sessaoTeste } = vi.hoisted(() => ({ sessaoTeste: { permissoes: [] } }))
vi.mock('../auth/autenticacao', () => ({
  temPermissao: (p) => !p || sessaoTeste.permissoes.includes(p),
}))
vi.mock('../services/quarentenaService', () => ({
  descartarItem: vi.fn(),
  iniciarAnaliseItem: vi.fn(),
  reprocessarItem: vi.fn(),
  adicionarValorDominio: vi.fn(),
  buscarTiposAreaProtegida: vi.fn().mockResolvedValue([]),
}))

import DetalheQuarentenaModal from './DetalheQuarentenaModal.vue'

const ITEM = {
  id: 7,
  entidade: 'imovel_rural',
  loteIngestaoId: 45,
  tipoErroCodigo: 'VALOR_FORA_DO_DOMINIO',
  statusAnaliseCodigo: 'PENDENTE',
  tabelaReferencia: 'situacao_imovel',
  campoProblema: 'situacao',
  valorRecebido: 'XX',
  motivoRejeicao: 'Valor fora do domínio',
  payloadOriginal: '{"situacao":"XX"}',
}

function montar(permissoes) {
  sessaoTeste.permissoes = permissoes
  return mount(DetalheQuarentenaModal, { props: { item: ITEM } })
}

describe('DetalheQuarentenaModal — permissões (LIZARDS-45)', () => {
  it('quem pode tratar vê revalidar, descartar, iniciar análise e cadastro de domínio', () => {
    const wrapper = montar(['quarentena:visualizar', 'quarentena:tratar'])

    expect(wrapper.find('.btn-reprocessar').exists()).toBe(true)
    expect(wrapper.find('.btn-descartar').exists()).toBe(true)
    expect(wrapper.find('.btn-analise').exists()).toBe(true)
    expect(wrapper.find('.secao-dominio').exists()).toBe(true)
    expect(wrapper.text()).toContain('Editar Correção Manual')
  })

  it('quem só visualiza inspeciona o registro sem nenhum botão de ação', () => {
    const wrapper = montar(['quarentena:visualizar'])

    expect(wrapper.text()).toContain('Fechar')
    expect(wrapper.find('.acoes-direita').exists()).toBe(false)
    expect(wrapper.find('.secao-dominio').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Editar Correção Manual')
  })
})

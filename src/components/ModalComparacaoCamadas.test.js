import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('../services/conjuntosDadosService', () => ({
  buscarComparacaoCamadas: vi.fn(),
}))

import { buscarComparacaoCamadas } from '../services/conjuntosDadosService'
import ModalComparacaoCamadas from './ModalComparacaoCamadas.vue'

const COMPARACAO = {
  registroBrutoId: 10,
  camadaOrigem: 'BRONZE',
  camadaDestino: 'SILVER',
  destinoEncontrado: true,
  mensagem: null,
  resumo: { iguais: 1, diferentes: 1, soOrigem: 1, soDestino: 1 },
  campos: [
    { campo: 'cod_imovel', valorOrigem: 'PR-1', valorDestino: 'PR-1', situacao: 'IGUAL' },
    { campo: 'status', valorOrigem: 'AT', valorDestino: 'Ativo', situacao: 'DIFERENTE' },
    { campo: 'extra', valorOrigem: 'x', valorDestino: null, situacao: 'SO_ORIGEM' },
    { campo: 'indicador', valorOrigem: null, valorDestino: '3.4', situacao: 'SO_DESTINO' },
  ],
}

async function montar(props = {}) {
  const wrapper = mount(ModalComparacaoCamadas, { props: { registroBrutoId: 10, ...props } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  buscarComparacaoCamadas.mockReset()
  buscarComparacaoCamadas.mockResolvedValue(COMPARACAO)
})

describe('ModalComparacaoCamadas', () => {
  it('abre em Bronze → Silver e mostra o diff unificado como o GitHub', async () => {
    const wrapper = await montar()

    expect(buscarComparacaoCamadas).toHaveBeenCalledWith(10, 'BRONZE', 'SILVER')
    // contexto (igual) + 1 removida/1 adicionada (diferente) + só origem (removida) + só destino (adicionada)
    expect(wrapper.findAll('.linha--ctx')).toHaveLength(1)
    expect(wrapper.findAll('.linha--del')).toHaveLength(2)
    expect(wrapper.findAll('.linha--add')).toHaveLength(2)
    expect(wrapper.find('.contagem--add').text()).toBe('+2')
    expect(wrapper.find('.contagem--del').text()).toBe('−2')
  })

  it('campo diferente vira linha removida com o valor antigo e adicionada com o novo', async () => {
    const wrapper = await montar()

    const removida = wrapper.findAll('.linha--del')[0]
    const adicionada = wrapper.findAll('.linha--add')[0]
    expect(removida.text()).toContain('status:')
    expect(removida.text()).toContain('AT')
    expect(adicionada.text()).toContain('Ativo')
  })

  it('destaca só o trecho que mudou', async () => {
    buscarComparacaoCamadas.mockResolvedValue({
      ...COMPARACAO,
      campos: [{ campo: 'area', valorOrigem: '230.2059', valorDestino: '230.2060', situacao: 'DIFERENTE' }],
    })

    const wrapper = await montar()

    expect(wrapper.find('.linha--del mark').text()).toBe('59')
    expect(wrapper.find('.linha--add mark').text()).toBe('60')
  })

  it('campo que existe só de um lado aparece só nesse lado', async () => {
    const wrapper = await montar()

    expect(wrapper.text()).toContain('indicador: 3.4')
    expect(wrapper.findAll('.linha--del')[1].text()).toContain('extra: x')
  })

  it('abre direto em Silver → Gold quando o par inicial pede', async () => {
    await montar({ parInicial: 'SILVER_GOLD' })

    expect(buscarComparacaoCamadas).toHaveBeenCalledWith(10, 'SILVER', 'GOLD')
  })

  it('trocar o par busca de novo com as camadas novas', async () => {
    const wrapper = await montar()

    await wrapper.findAll('.botao-par')[1].trigger('click')
    await flushPromises()

    expect(buscarComparacaoCamadas).toHaveBeenLastCalledWith(10, 'SILVER', 'GOLD')
  })

  it('"Só diferenças" esconde as linhas de contexto', async () => {
    const wrapper = await montar()

    await wrapper.find('.filtro-diferencas input').setValue(true)

    expect(wrapper.find('.linha--ctx').exists()).toBe(false)
    expect(wrapper.findAll('.linha--del')).toHaveLength(2)
  })

  it('visão lado a lado junta a linha removida e a adicionada na mesma fileira', async () => {
    const wrapper = await montar()

    await wrapper.find('.botao-modo-lado').trigger('click')

    expect(wrapper.find('.tabela-lado').exists()).toBe(true)
    // contexto, diferente (par), só origem, só destino
    expect(wrapper.findAll('.tabela-lado tr')).toHaveLength(4)
  })

  it('explica por que não há comparação quando o destino não tem o registro', async () => {
    buscarComparacaoCamadas.mockResolvedValue({
      ...COMPARACAO,
      destinoEncontrado: false,
      mensagem: 'O imóvel PR-9 ainda não foi publicado na Gold.',
      campos: [],
    })

    const wrapper = await montar({ parInicial: 'SILVER_GOLD' })

    expect(wrapper.text()).toContain('ainda não foi publicado na Gold')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('mostra o erro quando a busca falha', async () => {
    buscarComparacaoCamadas.mockRejectedValue(new Error('Falha ao comparar'))

    const wrapper = await montar()

    expect(wrapper.find('.estado-vazio--erro').text()).toBe('Falha ao comparar')
  })

  it('fechar emite o evento', async () => {
    const wrapper = await montar()

    await wrapper.find('.botao-fechar').trigger('click')

    expect(wrapper.emitted('fechar')).toHaveLength(1)
  })
})

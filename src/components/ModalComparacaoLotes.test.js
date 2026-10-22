import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ModalComparacaoLotes from './ModalComparacaoLotes.vue'
import { buscarComparacaoLotes } from '../services/conjuntosDadosService'

vi.mock('../services/conjuntosDadosService', () => ({ buscarComparacaoLotes: vi.fn() }))

// Resposta do backend: já vem com o que mudou primeiro (ordem feita no servidor)
const RESPOSTA = {
  loteAtualId: 8,
  dataLoteAtual: '2026-10-21T23:48:11',
  loteAnteriorId: 3,
  dataLoteAnterior: '2026-10-17T14:28:24',
  fonteDadoId: 3,
  fonteDadoNome: 'CAR - Imóveis (PR)',
  campoChave: 'cod_imovel',
  loteAnteriorEncontrado: true,
  mensagem: null,
  resumo: { totalAtual: 3, totalAnterior: 2, adicionados: 1, removidos: 0, modificados: 1, inalterados: 1 },
  registros: [
    {
      chave: 'PR-NOVO', registroBrutoIdAtual: 11, registroBrutoIdAnterior: null,
      numeroLinhaAtual: 0, numeroLinhaAnterior: null, situacao: 'ADICIONADO',
      dadosAtual: { cod_imovel: 'PR-NOVO', dat_criacao: '2026-10-20' }, dadosAnterior: null, camposAlterados: [],
    },
    {
      chave: 'PR-1', registroBrutoIdAtual: 12, registroBrutoIdAnterior: 2,
      numeroLinhaAtual: 1, numeroLinhaAnterior: 1, situacao: 'MODIFICADO',
      dadosAtual: { cod_imovel: 'PR-1' }, dadosAnterior: { cod_imovel: 'PR-1' },
      camposAlterados: [{ campo: 'dat_criacao', valorAnterior: '2025-10-10', valorAtual: '2026-10-19' }],
    },
    {
      chave: null, registroBrutoIdAtual: 13, registroBrutoIdAnterior: 3,
      numeroLinhaAtual: 2, numeroLinhaAnterior: 2, situacao: 'INALTERADO',
      dadosAtual: { x: 1 }, dadosAnterior: { x: 1 }, camposAlterados: [],
    },
  ],
  totalRegistrosFiltrados: 3,
  pagina: 0,
  tamanho: 25,
}

let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  buscarComparacaoLotes.mockResolvedValue(RESPOSTA)
})
afterEach(() => wrapper?.unmount())

async function abrir() {
  wrapper = mount(ModalComparacaoLotes, { props: { fonteDadoId: 3, fonteDadoNome: 'CAR - Imóveis (PR)' } })
  await flushPromises()
}

/** [título, referência ao lado] de cada item da lista. */
function titulos() {
  return wrapper.findAll('.titulo-item').map((t) => {
    const ref = t.find('.numero-linha')
    const referencia = ref.exists() ? ref.text() : ''
    return [t.text().slice(0, t.text().length - referencia.length).trim(), referencia]
  })
}

describe('ModalComparacaoLotes (LIZARDS-30)', () => {
  it('busca a comparação da fonte e mostra os lotes e o resumo', async () => {
    await abrir()

    expect(buscarComparacaoLotes).toHaveBeenCalledWith(3, 0, 25, null)
    expect(wrapper.get('.barra-lotes').text()).toContain('#3')
    expect(wrapper.get('.barra-lotes').text()).toContain('#8')
    const cards = wrapper.findAll('.card-resumo').map((c) => [c.get('.valor-resumo').text(), c.get('.rotulo-resumo').text()])
    expect(cards).toEqual([['1', 'Adicionados'], ['0', 'Removidos'], ['1', 'Modificados'], ['1', 'Inalterados']])
  })

  it('o título do item é a chave natural; o id interno e a linha ficam como referência', async () => {
    await abrir()

    expect(titulos()[0]).toEqual(['PR-NOVO', 'registro #11 · linha 0'])
    expect(wrapper.findAll('.titulo-item')[0].attributes('title')).toBe('cod_imovel: PR-NOVO')
    expect(titulos()[1]).toEqual(['PR-1', 'registro #12 · linha 1'])
  })

  it('sem chave, cai no id do registro — e a linha 0 aparece', async () => {
    buscarComparacaoLotes.mockResolvedValue({
      ...RESPOSTA,
      registros: [{ ...RESPOSTA.registros[2], numeroLinhaAtual: 0 }],
    })
    await abrir()

    expect(titulos()[0]).toEqual(['Registro #13', '(linha 0)'])
  })

  it('removido mostra o id e a linha do lote anterior', async () => {
    buscarComparacaoLotes.mockResolvedValue({
      ...RESPOSTA,
      registros: [{
        chave: 'PR-VELHO', registroBrutoIdAtual: null, registroBrutoIdAnterior: 7,
        numeroLinhaAtual: null, numeroLinhaAnterior: 5, situacao: 'REMOVIDO',
        dadosAtual: null, dadosAnterior: { cod_imovel: 'PR-VELHO' }, camposAlterados: [],
      }],
    })
    await abrir()

    expect(titulos()[0]).toEqual(['PR-VELHO', 'registro #7 · linha 5'])
  })

  it('abrir um modificado mostra o campo com o valor anterior e o atual', async () => {
    await abrir()

    await wrapper.findAll('.cabecalho-item')[1].trigger('click')

    const detalhe = wrapper.get('.tabela-diff-campos').text()
    expect(detalhe).toContain('dat_criacao')
    expect(detalhe).toContain('2025-10-10')
    expect(detalhe).toContain('2026-10-19')
  })

  it('trocar o filtro busca de novo na página 0 com a situação', async () => {
    await abrir()

    await wrapper.findAll('.botao-filtro').find((b) => b.text().includes('Modificados')).trigger('click')
    await flushPromises()

    expect(buscarComparacaoLotes).toHaveBeenLastCalledWith(3, 0, 25, 'MODIFICADO')
  })

  it('fonte com um lote só mostra a mensagem do backend', async () => {
    buscarComparacaoLotes.mockResolvedValue({
      ...RESPOSTA,
      loteAnteriorEncontrado: false,
      mensagem: 'Este é o primeiro lote da fonte — não há lote anterior para comparar.',
      registros: [],
    })
    await abrir()

    expect(wrapper.text()).toContain('primeiro lote da fonte')
    expect(wrapper.find('.grade-resumo').exists()).toBe(false)
  })

  it('erro do backend aparece no modal', async () => {
    buscarComparacaoLotes.mockRejectedValue(new Error('Fonte sem lote promovido'))
    await abrir()

    expect(wrapper.get('.estado-vazio--erro').text()).toBe('Fonte sem lote promovido')
  })

  it('fecha pelo X e pela tecla Esc', async () => {
    await abrir()

    await wrapper.get('.botao-fechar').trigger('click')
    expect(wrapper.emitted('fechar')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('fechar')).toHaveLength(2)
  })

  it('depois de fechado, Esc não dispara mais nada', async () => {
    await abrir()
    wrapper.unmount()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('fechar')).toBeUndefined()
    wrapper = null
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GoldView from './GoldView.vue'
import {
  atualizarTipoIndicador,
  buscarImovelPublicado,
  cadastrarTipoIndicador,
  desativarTipoIndicador,
  listarImoveisPublicados,
  listarTiposIndicador,
} from '../services/goldService'

vi.mock('../services/goldService', () => ({
  atualizarTipoIndicador: vi.fn(),
  buscarImovelPublicado: vi.fn(),
  cadastrarTipoIndicador: vi.fn(),
  desativarTipoIndicador: vi.fn(),
  listarImoveisPublicados: vi.fn(),
  listarTiposIndicador: vi.fn(),
}))

let wrapper

const tiposFixture = [
  {
    id: 1,
    codigo: 'ISAP',
    descricao: 'Índice de Sobreposição com Áreas Protegidas',
    temFonte: true,
    ativo: true,
    dataAdd: '2026-09-01T12:00:00',
  },
  {
    id: 5,
    codigo: 'ICV',
    descricao: 'Índice de Cobertura Vegetal Nativa',
    temFonte: false,
    ativo: true,
    dataAdd: '2026-09-01T12:00:00',
  },
]

const imoveisFixture = [
  {
    id: 10,
    codImovel: 'PR-4106902-DEMO0001',
    indicadorVersaoId: 7,
    municipioCodIbge: 4106902,
    areaHa: 32.5,
    valorIcv: null,
    valorIrl: null,
    valorIapp: null,
    valorIsap: 0.18,
    valorIae: 0.05,
    valorIdesmat: 0.11,
    valorIfc: 0.4,
    dataPublicacao: '2026-09-01T12:00:00',
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  listarTiposIndicador.mockResolvedValue(tiposFixture)
  listarImoveisPublicados.mockResolvedValue(imoveisFixture)
  cadastrarTipoIndicador.mockResolvedValue({ id: 9, codigo: 'NOVO', descricao: 'Novo' })
  atualizarTipoIndicador.mockResolvedValue({ id: 1, codigo: 'ISAP', descricao: 'Atualizado' })
  desativarTipoIndicador.mockResolvedValue(undefined)
  buscarImovelPublicado.mockResolvedValue(imoveisFixture[0])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function abrir() {
  wrapper = mount(GoldView)
  await flushPromises()
}

describe('GoldView', () => {
  it('carrega tipos e imóveis sem acessar a rede diretamente', async () => {
    await abrir()

    expect(listarTiposIndicador).toHaveBeenCalledOnce()
    expect(listarImoveisPublicados).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('ISAP')
    expect(wrapper.text()).toContain('Tipos de indicador')
    expect(wrapper.text()).toContain('Imóveis publicados')
  })

  it('abre o modal de cadastro pelo botão Novo tipo', async () => {
    await abrir()

    await wrapper.get('button.botao-principal--compacto').trigger('click')

    expect(wrapper.get('#form-tipo-indicador').exists()).toBe(true)
    expect(wrapper.get('#input-codigo').element.value).toBe('')
    expect(wrapper.get('#input-descricao').element.value).toBe('')
  })

  it('valida código e descrição antes de chamar o serviço', async () => {
    await abrir()
    await wrapper.get('button.botao-principal--compacto').trigger('click')

    await wrapper.get('#form-tipo-indicador').trigger('submit')
    expect(wrapper.text()).toContain('Informe o código do tipo de indicador.')
    expect(cadastrarTipoIndicador).not.toHaveBeenCalled()

    await wrapper.get('#input-codigo').setValue('NOVO')
    await wrapper.get('#form-tipo-indicador').trigger('submit')
    expect(wrapper.text()).toContain('Informe a descrição do tipo de indicador.')
    expect(cadastrarTipoIndicador).not.toHaveBeenCalled()
  })

  it('cadastra um tipo, recarrega a lista e fecha o modal', async () => {
    await abrir()
    listarTiposIndicador.mockResolvedValueOnce(tiposFixture).mockResolvedValueOnce([
      ...tiposFixture,
      { id: 9, codigo: 'NOVO', descricao: 'Novo indicador', temFonte: true, ativo: true, dataAdd: '2026-09-23T12:00:00' },
    ])
    await wrapper.get('button.botao-principal--compacto').trigger('click')
    await wrapper.get('#input-codigo').setValue('novo')
    await wrapper.get('#input-descricao').setValue('Novo indicador')
    await wrapper.get('form#form-tipo-indicador').trigger('submit')
    await flushPromises()

    expect(cadastrarTipoIndicador).toHaveBeenCalledWith({
      codigo: 'novo',
      descricao: 'Novo indicador',
      temFonte: true,
      ativo: true,
    })
    expect(listarTiposIndicador).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#form-tipo-indicador').exists()).toBe(false)
    expect(wrapper.text()).toContain('Tipo de indicador cadastrado com sucesso.')
  })

  it('abre a edição preenchida e mantém o código bloqueado', async () => {
    await abrir()
    await wrapper.get('button[aria-label="Editar tipo de indicador"]').trigger('click')

    expect(wrapper.get('#input-codigo').element.value).toBe('ISAP')
    expect(wrapper.get('#input-codigo').element.disabled).toBe(true)
    expect(wrapper.get('#input-descricao').element.value).toBe('Índice de Sobreposição com Áreas Protegidas')
  })

  it('atualiza descrição e flags sem tentar alterar o código', async () => {
    await abrir()
    await wrapper.get('button[aria-label="Editar tipo de indicador"]').trigger('click')
    await wrapper.get('#input-descricao').setValue('Descrição Atualizada')
    await wrapper.get('#form-tipo-indicador').trigger('submit')
    await flushPromises()

    expect(atualizarTipoIndicador).toHaveBeenCalledWith(1, {
      codigo: 'ISAP',
      descricao: 'Descrição Atualizada',
      temFonte: true,
      ativo: true,
    })
    expect(wrapper.find('#form-tipo-indicador').exists()).toBe(false)
  })

  it('desativa um tipo usando o soft-delete do backend', async () => {
    await abrir()
    await wrapper.get('button[aria-label="Desativar tipo de indicador"]').trigger('click')
    await flushPromises()

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(desativarTipoIndicador).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Tipo ISAP desativado com sucesso.')
  })

  it('remove o feedback de sucesso automaticamente após quatro segundos', async () => {
    vi.useFakeTimers()

    await abrir()
    await wrapper.get('button.botao-principal--compacto').trigger('click')
    await wrapper.get('#input-codigo').setValue('NOVO')
    await wrapper.get('#input-descricao').setValue('Novo indicador')
    await wrapper.get('#form-tipo-indicador').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Tipo de indicador cadastrado com sucesso.')

    await vi.advanceTimersByTimeAsync(3999)
    expect(wrapper.text()).toContain('Tipo de indicador cadastrado com sucesso.')

    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.text()).not.toContain('Tipo de indicador cadastrado com sucesso.')
  })

  it('troca para imóveis, filtra por código e consulta o detalhe pelo endpoint específico', async () => {
    await abrir()
    await wrapper.get('.aba:nth-child(2)').trigger('click')

    expect(wrapper.text()).toContain('PR-4106902-DEMO0001')
    await wrapper.get('.campo-busca input').setValue('0001')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)

    await wrapper.get('button.btn-detalhe').trigger('click')
    await flushPromises()

    expect(buscarImovelPublicado).toHaveBeenCalledWith('PR-4106902-DEMO0001')
    expect(wrapper.text()).toContain('Indicadores publicados')
    expect(wrapper.text()).toContain('ISAP')
    expect(wrapper.text()).toContain('0,18')
  })

  it('mostra o erro retornado pelo serviço ao cadastrar', async () => {
    cadastrarTipoIndicador.mockRejectedValueOnce(new Error('Já existe um tipo de indicador com o código ISAP'))
    await abrir()
    await wrapper.get('button.botao-principal--compacto').trigger('click')
    await wrapper.get('#input-codigo').setValue('ISAP')
    await wrapper.get('#input-descricao').setValue('Duplicado')
    await wrapper.get('#form-tipo-indicador').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Já existe um tipo de indicador com o código ISAP')
    expect(wrapper.get('#form-tipo-indicador').exists()).toBe(true)
  })
})

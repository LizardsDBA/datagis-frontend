import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import L from 'leaflet'
import ConjuntosView from './ConjuntosView.vue'
import { buscarConjuntos, buscarFontes, criarConjunto } from '../services/conjuntoService'

vi.mock('../services/conjuntoService', () => ({
  buscarConjuntos: vi.fn(), buscarFontes: vi.fn(), criarConjunto: vi.fn(),
}))

// Isola o Leaflet: os testes não acessam tiles nem dependem de layout real do navegador.
vi.mock('leaflet', () => ({ default: {
  Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  map: vi.fn(() => ({ remove: vi.fn(), removeLayer: vi.fn(), fitBounds: vi.fn() })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  geoJSON: vi.fn(() => ({
    bindTooltip: vi.fn(), on: vi.fn(), addTo: vi.fn(), setStyle: vi.fn(),
    getBounds: () => ({ isValid: () => true, extend() { return this } }),
  })),
} }))

let wrapper
beforeEach(() => {
  vi.resetAllMocks()
  buscarConjuntos.mockResolvedValue([])
  buscarFontes.mockResolvedValue([{ id: 7, nome: 'CAR PR', orgao: 'SICAR' }])
  criarConjunto.mockResolvedValue({ id: 42 })
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

async function abrir() {
  wrapper = mount(ConjuntosView)
  await flushPromises()
}

async function preencher() {
  await wrapper.get('#select-fonte').setValue('7')
  await wrapper.get('#input-competencia').setValue('2026-09')
}

describe('ConjuntosView', () => {
  it('carrega fontes e mostra o estado vazio', async () => {
    await abrir()
    expect(buscarConjuntos).toHaveBeenCalledOnce()
    expect(buscarFontes).toHaveBeenCalledOnce()
    expect(wrapper.get('#select-fonte').text()).toContain('CAR PR — SICAR')
    expect(wrapper.text()).toContain('Nenhum conjunto cadastrado ainda.')
  })

  it('impede envio sem fonte e depois sem competência', async () => {
    await abrir()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.alerta-form--erro').text()).toContain('Selecione uma fonte de dados.')
    await wrapper.get('#select-fonte').setValue('7')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.alerta-form--erro').text()).toContain('Informe a competência')
    expect(criarConjunto).not.toHaveBeenCalled()
  })

  it('converte mês em data, envia status e atualiza a lista após salvar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await abrir()
    await preencher()
    await wrapper.get('input[value="PROCESSANDO"]').setValue()
    buscarConjuntos.mockResolvedValue([{ id: 42, fonteDadoNome: 'CAR PR', competencia: '2026-09-01', statusCamada: 'PROCESSANDO' }])
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(criarConjunto).toHaveBeenCalledWith({
      fonteDadoId: 7, competencia: '2026-09-01', statusCamada: 'PROCESSANDO', coberturaTerritorial: null,
    })
    expect(wrapper.get('.item-conjunto').text()).toContain('09/2026')
    expect(wrapper.get('.item-conjunto').text()).toContain('Processando')
    expect(wrapper.get('#select-fonte').element.value).toBe('')
    expect(wrapper.get('#input-competencia').element.value).toBe('')
    expect(wrapper.get('input[value="ATIVA"]').element.checked).toBe(true)
    expect(wrapper.text()).toContain('Conjunto cadastrado com sucesso!')
    await vi.advanceTimersByTimeAsync(4000)
    expect(wrapper.find('.alerta-form--sucesso').exists()).toBe(false)
  })

  it('desabilita o botão enquanto o cadastro está pendente', async () => {
    await abrir()
    await preencher()
    let rejeitar
    criarConjunto.mockReturnValue(new Promise((_, reject) => { rejeitar = reject }))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Cadastrando...')
    rejeitar(new Error('Fonte não encontrada'))
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(false)
    expect(wrapper.get('.alerta-form--erro').text()).toContain('Fonte não encontrada')
    expect(wrapper.get('#input-competencia').element.value).toBe('2026-09')
    expect(buscarConjuntos).toHaveBeenCalledOnce()
  })

  it('mostra erro no carregamento e permite tentar novamente', async () => {
    buscarConjuntos.mockRejectedValueOnce(new Error('Serviço indisponível'))
    await abrir()
    expect(wrapper.get('.banner-erro').text()).toContain('Serviço indisponível')
    await wrapper.get('button[title="Recarregar"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.banner-erro').exists()).toBe(false)
    expect(buscarConjuntos).toHaveBeenCalledTimes(2)
  })

  it('renderiza cobertura GeoJSON, destaca o conjunto e libera o mapa ao sair', async () => {
    const cobertura = { type: 'Polygon', coordinates: [[[-50, -25], [-49, -25], [-49, -24], [-50, -25]]] }
    buscarConjuntos.mockResolvedValue([{ id: 42, fonteDadoNome: 'CAR PR', competencia: '2026-09-01', statusCamada: 'ATIVA', coberturaTerritorial: cobertura }])
    await abrir()
    expect(L.geoJSON).toHaveBeenCalledWith(cobertura, expect.any(Object))
    const mapa = L.map.mock.results[0].value
    const camada = L.geoJSON.mock.results[0].value
    await wrapper.get('.item-conjunto').trigger('click')
    expect(wrapper.get('.item-conjunto').classes()).toContain('item-conjunto--destaque')
    expect(camada.setStyle).toHaveBeenCalledWith(expect.objectContaining({ color: '#d97706' }))
    expect(mapa.fitBounds).toHaveBeenCalled()
    wrapper.unmount()
    wrapper = null
    expect(mapa.remove).toHaveBeenCalledOnce()
  })
})

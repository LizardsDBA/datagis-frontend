import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import InicioView from './InicioView.vue'
import { listarFavoritos, salvarFavoritos } from '../services/favoritoService'
import { listarTiposIndicador, obterStatusGold } from '../services/goldService'
import { listarIndicadoresPorMunicipio } from '../services/consultaIndicadoresService'
import { PERMISSOES } from '../auth/permissoes'

const { sessaoTeste, permissoes, abrirPainel, emAndamento } = vi.hoisted(() => ({
  sessaoTeste: { login: 'maria', nome: 'Maria Souza', perfis: ['perfil-analista'] },
  permissoes: { lista: [] },
  abrirPainel: vi.fn(),
  emAndamento: { valor: 0 },
}))
vi.mock('../auth/autenticacao', () => ({
  sessao: sessaoTeste,
  temPermissao: (p) => !p || permissoes.lista.includes(p),
  nomeDoPerfil: (c) => c.replace('perfil-', ''),
}))
vi.mock('../services/favoritoService', () => ({ listarFavoritos: vi.fn(), salvarFavoritos: vi.fn() }))
vi.mock('../services/goldService', () => ({ obterStatusGold: vi.fn(), listarTiposIndicador: vi.fn() }))
vi.mock('../services/consultaIndicadoresService', () => ({ listarIndicadoresPorMunicipio: vi.fn() }))
vi.mock('../composables/useMonitoramentoGlobal', () => ({
  useMonitoramentoGlobal: () => ({ totalEmAndamento: ref(emAndamento.valor), abrirPainel }),
}))

function montar() {
  return mount(InicioView, { global: { stubs: { 'router-link': RouterLinkStub } } })
}

const MUNICIPIOS = [
  { codIbge: 4106902, nome: 'Curitiba', qtdImoveis: 111, qtdImoveisComIntersecao: 5, areaTotalHa: 1316.97, valorIcv: 10, valorIrl: 0, valorIapp: null, valorIsap: 1, valorIae: 0, valorIdesmat: 2, valorIfc: 0 },
  { codIbge: 4119905, nome: 'Ponta Grossa', qtdImoveis: 2657, qtdImoveisComIntersecao: 1300, areaTotalHa: 187029.84, valorIcv: 27.29, valorIrl: 16.98, valorIapp: 2.64, valorIsap: 7.69, valorIae: 0.23, valorIdesmat: 20.24, valorIfc: 0.35 },
]
const TIPOS = [
  { codigo: 'IFC', ordemExibicao: 7, unidadeSimbolo: 'focos/1.000 ha', sentido: 'MENOR_MELHOR', limiteBom: 0.5, limiteAtencao: 2 },
  { codigo: 'ICV', ordemExibicao: 1, unidadeSimbolo: '%', sentido: 'MAIOR_MELHOR', limiteBom: 40, limiteAtencao: 20 },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  listarIndicadoresPorMunicipio.mockResolvedValue(MUNICIPIOS)
  listarTiposIndicador.mockResolvedValue(TIPOS)
  permissoes.lista = [PERMISSOES.FONTE_VISUALIZAR, PERMISSOES.LOTE_VISUALIZAR, PERMISSOES.INDICADOR_VISUALIZAR]
  emAndamento.valor = 0
  listarFavoritos.mockResolvedValue([])
  salvarFavoritos.mockImplementation(async (rotas) => rotas)
  obterStatusGold.mockResolvedValue({
    indicadores: { status: 'CONCLUIDA', concluidoEm: '2026-10-25T19:39:29', totalSucesso: 4613 },
  })
})

describe('InicioView', () => {
  it('cumprimenta pelo primeiro nome e mostra o perfil', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('.inicio-titulo').text()).toMatch(/(Bom dia|Boa tarde|Boa noite), Maria$/)
    expect(wrapper.find('.inicio-sub').text()).toBe('analista')
  })

  it('mostra só as telas que o perfil pode abrir', async () => {
    const wrapper = montar()
    await flushPromises()

    const titulos = wrapper.findAll('.card-tela-titulo').map((t) => t.text())
    expect(titulos).toContain('Cadastro de Fontes')
    expect(titulos).toContain('Lotes e Pipeline')
    expect(titulos).not.toContain('Logs de Auditoria')
  })

  it('lista os favoritos salvos na ordem e ignora tela sem permissão', async () => {
    listarFavoritos.mockResolvedValue(['/lotes', '/auditoria', '/fontes'])
    const wrapper = montar()
    await flushPromises()

    const favoritos = wrapper.findAll('.atalho .atalho-rotulo').map((t) => t.text())
    expect(favoritos).toEqual(['Lotes e Pipeline', 'Cadastro de Fontes'])
  })

  it('sem favoritos, explica como marcar', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Não há favoritos')
  })

  it('a estrela adiciona e remove favorito, salvando no backend', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.find('[aria-label="Adicionar Lotes e Pipeline aos favoritos"]').trigger('click')
    await flushPromises()
    expect(salvarFavoritos).toHaveBeenLastCalledWith(['/lotes'])
    expect(wrapper.findAll('.atalho')).toHaveLength(1)

    await wrapper.find('[aria-label="Remover Lotes e Pipeline dos favoritos"]').trigger('click')
    await flushPromises()
    expect(salvarFavoritos).toHaveBeenLastCalledWith([])
    expect(wrapper.findAll('.atalho')).toHaveLength(0)
  })

  it('se salvar falhar, volta como estava e avisa', async () => {
    salvarFavoritos.mockRejectedValue(new Error('Falha ao salvar os favoritos'))
    const wrapper = montar()
    await flushPromises()

    await wrapper.find('[aria-label="Adicionar Lotes e Pipeline aos favoritos"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.atalho')).toHaveLength(0)
    expect(wrapper.find('.alerta-erro').text()).toContain('Falha ao salvar os favoritos')
  })

  it('mostra a última publicação da Gold para quem vê indicadores', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Última publicação da Gold')
    expect(wrapper.text()).toContain('Concluída')
    expect(wrapper.text()).toContain('4613 imóveis')
  })

  it('não consulta a Gold sem a permissão de indicadores', async () => {
    permissoes.lista = [PERMISSOES.FONTE_VISUALIZAR]
    const wrapper = montar()
    await flushPromises()

    expect(obterStatusGold).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Última publicação da Gold')
  })

  it('Gold nunca publicada aparece como ainda não publicada', async () => {
    obterStatusGold.mockResolvedValue({ indicadores: { status: 'NUNCA_EXECUTADO' } })
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('Ainda não publicada')
  })

  it('o card de processamentos abre o painel', async () => {
    emAndamento.valor = 2
    const wrapper = montar()
    await flushPromises()

    const card = wrapper.find('.card-resumo')
    expect(card.text()).toContain('2')
    await card.trigger('click')
    expect(abrirPainel).toHaveBeenCalled()
  })

  it('não busca nada pesado: favoritos, status da Gold, indicadores por município e o catálogo', async () => {
    montar()
    await flushPromises()

    expect(listarFavoritos).toHaveBeenCalledTimes(1)
    expect(obterStatusGold).toHaveBeenCalledTimes(1)
    expect(listarIndicadoresPorMunicipio).toHaveBeenCalledTimes(1)
    expect(listarTiposIndicador).toHaveBeenCalledTimes(1)
  })

  it('mostra os totais e os indicadores por município, sem mapa', async () => {
    const wrapper = montar()
    await flushPromises()

    const secao = wrapper.find('[data-secao="indicadores"]')
    const totais = secao.findAll('.total').map((t) => t.text())
    expect(totais).toEqual(['2.768imóveis publicados', '2municípios', '1.305imóveis com sobreposição', '188.347hectares'])
    // ordem do catálogo (ordemExibicao) e unidade no cabeçalho
    expect(secao.findAll('th').map((t) => t.text())).toEqual(['Município', 'Imóveis', 'ICV %', 'IFC focos/1.000 ha'])
    // o município com mais imóveis vem primeiro
    const primeira = secao.findAll('tbody tr')[0].findAll('td').map((t) => t.text())
    expect(primeira).toEqual(['Ponta Grossa', '2.657', '27,3', '0,4'])
    expect(secao.find('.leaflet-container').exists()).toBe(false)
  })

  it('indicador não calculado aparece como traço, não como zero', async () => {
    listarTiposIndicador.mockResolvedValue([{ codigo: 'IAPP', ordemExibicao: 3 }])
    const wrapper = montar()
    await flushPromises()

    const curitiba = wrapper.findAll('[data-secao="indicadores"] tbody tr')[1].findAll('td').map((t) => t.text())
    expect(curitiba).toEqual(['Curitiba', '111', '—'])
  })

  it('sem indicadores publicados, explica que dependem da Gold', async () => {
    listarIndicadoresPorMunicipio.mockResolvedValue([])
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('[data-secao="indicadores"]').text()).toContain('Nenhum indicador publicado ainda')
  })

  it('sem permissão de indicadores, a seção nem aparece e nada é consultado', async () => {
    permissoes.lista = [PERMISSOES.FONTE_VISUALIZAR]
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('[data-secao="indicadores"]').exists()).toBe(false)
    expect(listarIndicadoresPorMunicipio).not.toHaveBeenCalled()
    expect(listarTiposIndicador).not.toHaveBeenCalled()
  })

  it('não tem mais botão Mostrar/Minimizar: o título da seção é que abre e minimiza', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).not.toMatch(/\bMinimizar\b|\bMostrar\b(?! de novo)/)
    const titulo = wrapper.find('[data-secao="telas"] .secao-alternar')
    expect(titulo.text()).toBe('Todas as telas')
    expect(titulo.attributes('aria-expanded')).toBe('true')
    expect(titulo.find('.secao-seta').classes()).toContain('secao-seta--aberta')

    await titulo.trigger('click')
    expect(wrapper.find('[data-secao="telas"] .grade-telas').exists()).toBe(false)
    expect(titulo.attributes('aria-expanded')).toBe('false')
    expect(titulo.find('.secao-seta').classes()).not.toContain('secao-seta--aberta')

    await titulo.trigger('click')
    expect(wrapper.find('[data-secao="telas"] .grade-telas').exists()).toBe(true)
  })

  it('a seção minimizada é lembrada na próxima vez', async () => {
    const wrapper = montar()
    await flushPromises()
    await wrapper.find('[data-secao="telas"] .secao-alternar').trigger('click')

    const deNovo = montar()
    await flushPromises()
    expect(deNovo.find('[data-secao="telas"] .grade-telas').exists()).toBe(false)
    expect(deNovo.find('[data-secao="favoritos"] .secao-alternar').attributes('aria-expanded')).toBe('true')
  })

  it('ocultar tira a tela da lista e "Mostrar de novo" devolve', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.find('[aria-label="Ocultar Lotes e Pipeline da Home"]').trigger('click')
    const visiveis = () => wrapper.findAll('[data-secao="telas"] .grade-telas .card-tela-titulo').map((t) => t.text())
    expect(visiveis()).not.toContain('Lotes e Pipeline')

    await wrapper.find('.link-ocultas').trigger('click')
    expect(wrapper.find('.lista-ocultas').text()).toContain('Lotes e Pipeline')
    await wrapper.find('.btn-reexibir').trigger('click')
    expect(visiveis()).toContain('Lotes e Pipeline')
    expect(wrapper.find('.link-ocultas').exists()).toBe(false)
  })

  it('tela oculta continua podendo ser favorita', async () => {
    listarFavoritos.mockResolvedValue(['/lotes'])
    const wrapper = montar()
    await flushPromises()

    await wrapper.find('[aria-label="Ocultar Lotes e Pipeline da Home"]').trigger('click')
    expect(wrapper.findAll('.atalho .atalho-rotulo').map((t) => t.text())).toEqual(['Lotes e Pipeline'])
  })

  it('pinta os valores com as mesmas faixas da tela de indicadores', async () => {
    const wrapper = montar()
    await flushPromises()

    const [pontaGrossa, curitiba] = wrapper.findAll('[data-secao="indicadores"] tbody tr')
    const faixas = (linha) => linha.findAll('.badge-tag').map((b) => b.classes().find((c) => c.startsWith('badge-tag--')))
    // ICV 27,3 (maior é melhor, entre 20 e 40) = atenção; IFC 0,35 (menor é melhor, até 0,5) = bom
    expect(faixas(pontaGrossa)).toEqual(['badge-tag--alerta', 'badge-tag--sucesso'])
    // ICV 10 abaixo de 20 = crítico
    expect(faixas(curitiba)[0]).toBe('badge-tag--erro')
  })

  it('a seção de indicadores só tem "Ver em tabela", que some ao minimizar', async () => {
    const wrapper = montar()
    await flushPromises()

    const secao = () => wrapper.find('[data-secao="indicadores"]')
    expect(secao().text()).not.toContain('Ver no mapa')
    const link = secao().findAllComponents(RouterLinkStub).find((l) => l.text() === 'Ver em tabela')
    expect(link.props('to')).toBe('/indicadores')
    expect(link.classes()).toContain('btn-secao')

    await secao().find('.secao-alternar').trigger('click')
    expect(secao().text()).not.toContain('Ver em tabela')
  })

  it('favorito aparece como atalho com o ícone e a cor da tela', async () => {
    listarFavoritos.mockResolvedValue(['/fontes'])
    const wrapper = montar()
    await flushPromises()

    const atalho = wrapper.find('.atalho')
    expect(atalho.find('.atalho-rotulo').text()).toBe('Cadastro de Fontes')
    expect(atalho.find('.atalho-icone').attributes('style')).toContain('background')
    expect(atalho.find('.atalho-icone svg').exists()).toBe(true)
  })
})

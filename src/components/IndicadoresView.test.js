import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import IndicadoresView from './IndicadoresView.vue'
import { listarTiposIndicador } from '../services/goldService'
import {
    listarIndicadoresPorImovel,
    listarIndicadoresPorMunicipio,
} from '../services/consultaIndicadoresService'

vi.mock('../services/goldService', () => ({ listarTiposIndicador: vi.fn() }))
// Rota falsa: a query é editável por teste (vindo do mapa, LIZARDS-35).
const rota = vi.hoisted(() => ({ query: {}, push: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => rota, useRouter: () => ({ push: rota.push }) }))
const permissoes = vi.hoisted(() => ({ lista: ['conjunto:visualizar'] }))
vi.mock('../auth/autenticacao', () => ({ temPermissao: (p) => permissoes.lista.includes(p) }))
vi.mock('../services/consultaIndicadoresService', () => ({
    listarIndicadoresPorMunicipio: vi.fn(),
    listarIndicadoresPorImovel: vi.fn(),
}))

// Catálogo igual ao que a V076 gravou: 3 dimensões, 2 sentidos, faixas por indicador.
const TIPOS = [
    { codigo: 'ICV', descricao: 'Cobertura Vegetal', dimensao: 'CONSERVACAO', sentido: 'MAIOR_MELHOR', limiteBom: 70, limiteAtencao: 40, ordemExibicao: 1, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    // IRL: conformidade legal é binária — limites iguais, sem faixa intermediária.
    { codigo: 'IRL', descricao: 'Reserva Legal', dimensao: 'CONSERVACAO', sentido: 'MAIOR_MELHOR', limiteBom: 20, limiteAtencao: 20, ordemExibicao: 2, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    { codigo: 'IAPP', descricao: 'Área de Preservação', dimensao: 'CONSERVACAO', sentido: 'MAIOR_MELHOR', limiteBom: 70, limiteAtencao: 40, ordemExibicao: 3, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    // ISAP mede sobreposição com área protegida: menos é melhor, igual ao IAE.
    { codigo: 'ISAP', descricao: 'Áreas Protegidas', dimensao: 'TERRITORIAL', sentido: 'MENOR_MELHOR', limiteBom: 30, limiteAtencao: 60, ordemExibicao: 4, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    { codigo: 'IAE', descricao: 'Área Embargada', dimensao: 'TERRITORIAL', sentido: 'MENOR_MELHOR', limiteBom: 30, limiteAtencao: 60, ordemExibicao: 5, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    { codigo: 'IDESMAT', descricao: 'Desmatamento', dimensao: 'AMBIENTAL', sentido: 'MENOR_MELHOR', limiteBom: 30, limiteAtencao: 60, ordemExibicao: 6, ativo: true, unidade: 'PERCENTUAL', unidadeSimbolo: '%' },
    { codigo: 'IFC', descricao: 'Focos de Calor', dimensao: 'AMBIENTAL', sentido: 'MENOR_MELHOR', limiteBom: 30, limiteAtencao: 60, ordemExibicao: 7, ativo: true, unidade: 'DENSIDADE', unidadeSimbolo: 'focos/1.000 ha' },
]

const MUNICIPIOS = [
    {
        codIbge: 4106902,
        nome: 'Curitiba',
        qtdImoveis: 111,
        areaTotalHa: 1316.97,
        valorIcv: 85.0, // maior é melhor, acima de 70 => bom
        valorIrl: 50.0, // maior é melhor, acima do mínimo legal de 20 => bom
        valorIapp: 10.0, // abaixo de 40 => crítico
        valorIsap: 45.0, // menor é melhor, entre 30 e 60 => atenção
        valorIae: 10.0, // menor é melhor, abaixo de 30 => bom
        valorIdesmat: 80.0, // menor é melhor, acima de 60 => crítico
        valorIfc: null, // sem cálculo => neutro
    },
    {
        codIbge: 4119905,
        nome: 'Ponta Grossa',
        qtdImoveis: 2657,
        areaTotalHa: 187029.84,
        valorIcv: 27.31,
        valorIrl: 16.98,
        valorIapp: 59.69,
        valorIsap: 17.95,
        valorIae: 0.23,
        valorIdesmat: 28.94,
        valorIfc: 9.87,
    },
]

const IMOVEIS = [
    {
        codImovel: 'PR-4106902-00B2EA81503E46B8BD95A7E35BBB8472',
        municipioCodIbge: 4106902,
        municipioNome: 'Curitiba',
        areaHa: 8.89,
        valorIcv: 15.54,
        valorIrl: 6.05,
        valorIapp: 17.67,
        valorIsap: 22.32,
        valorIae: 0,
        valorIdesmat: 0,
        valorIfc: 4.1,
    },
    {
        codImovel: 'PR-4119905-0507A42A8146420983EA8718A2C69771',
        municipioCodIbge: 4119905,
        municipioNome: 'Ponta Grossa',
        areaHa: 4.55,
        valorIcv: 0,
        valorIrl: 0,
        valorIapp: 0,
        valorIsap: 0,
        valorIae: 0,
        valorIdesmat: 0,
        valorIfc: 0,
    },
]

// Ordem das colunas de indicador na tabela, depois das 3 colunas fixas.
const COLUNA = { ICV: 3, IRL: 4, IAPP: 5, ISAP: 6, IAE: 7, IDESMAT: 8, IFC: 9 }
// Ordem das barras no detalhe, com a aba "Todas".
const BARRA = { ICV: 0, IRL: 1, IAPP: 2, ISAP: 3, IAE: 4, IDESMAT: 5, IFC: 6 }

/** Linhas de dado; o detalhe aberto é outra <tr> e não entra nesta contagem. */
function linhasDe(wrapper) {
    return wrapper.findAll('tbody tr.linha-dados')
}

function classeDa(linha, codigo) {
    return linha.findAll('td')[COLUNA[codigo]].find('span').classes().join(' ')
}

function abas(wrapper) {
    return wrapper.findAll('.aba-pagina')
}

async function irParaImoveis(wrapper) {
    await abas(wrapper)[1].trigger('click')
    await flushPromises()
}

beforeEach(() => {
    listarTiposIndicador.mockResolvedValue(TIPOS)
    listarIndicadoresPorMunicipio.mockResolvedValue(MUNICIPIOS)
    listarIndicadoresPorImovel.mockResolvedValue(IMOVEIS)
})

afterEach(() => {
    vi.clearAllMocks()
    rota.query = {}
    permissoes.lista = ['conjunto:visualizar']
})

describe('IndicadoresView', () => {
    // ------------------------------------------------------------------ abertura

    it('abre na aba por município e mostra os totais do recorte publicado', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const resumo = wrapper.find('.faixa-resumo').text()
        expect(resumo).toContain('2.768') // 111 + 2657 imóveis
        expect(resumo).toContain('188.346,81') // 1.316,97 + 187.029,84 ha

        expect(abas(wrapper)[0].classes()).toContain('aba-pagina--ativa')

        const linhas = linhasDe(wrapper)
        expect(linhas).toHaveLength(2)
        expect(linhas[0].text()).toContain('Curitiba')
    })

    it('não busca os imóveis antes de o usuário abrir a aba', async () => {
        mount(IndicadoresView)
        await flushPromises()

        expect(listarIndicadoresPorMunicipio).toHaveBeenCalledTimes(1)
        expect(listarIndicadoresPorImovel).not.toHaveBeenCalled()
    })

    // -------------------------------------------------------------------- tabela

    it('agrupa as colunas por dimensão, na ordem do catálogo', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(wrapper.findAll('thead th.col-dimensao').map((th) => th.text())).toEqual([
            'Conservação',
            'Territorial',
            'Ambiental',
        ])
        expect(wrapper.findAll('thead th.col-indicador').map((th) => th.text())).toEqual([
            'ICV',
            'IRL',
            'IAPP',
            'ISAP',
            'IAE',
            'IDESMAT',
            'IFC',
        ])
    })

    it('alinha a coluna de município igual no cabeçalho e no valor', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        // Município é texto: cabeçalho e célula usam a mesma classe de alinhamento.
        expect(wrapper.findAll('thead th')[1].classes()).toContain('col-municipio')
        expect(linhasDe(wrapper)[0].findAll('td')[1].classes()).toContain('col-municipio')
    })

    it('pinta a faixa conforme os limites do indicador', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const curitiba = linhasDe(wrapper)[0]
        expect(classeDa(curitiba, 'ICV')).toContain('badge-tag--sucesso')
        expect(classeDa(curitiba, 'ISAP')).toContain('badge-tag--alerta')
        expect(classeDa(curitiba, 'IAPP')).toContain('badge-tag--erro')
    })

    it('inverte a faixa nos indicadores em que menos é melhor', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const curitiba = linhasDe(wrapper)[0]
        expect(classeDa(curitiba, 'IAE')).toContain('badge-tag--sucesso')
        expect(classeDa(curitiba, 'IDESMAT')).toContain('badge-tag--erro')
        // ISAP mede invasão de área protegida: 45 é atenção, não "quase bom".
        expect(classeDa(curitiba, 'ISAP')).toContain('badge-tag--alerta')
    })

    it('mostra indicador sem cálculo como neutro, e não como crítico', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const celula = linhasDe(wrapper)[0].findAll('td')[COLUNA.IFC]
        expect(celula.find('span').classes()).toContain('badge-tag--neutro')
        expect(celula.find('span').classes()).not.toContain('badge-tag--erro')
        expect(celula.text()).toBe('—')
    })

    it('trata zero calculado como valor, e não como ausência de cálculo', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        const segundo = linhasDe(wrapper)[1]
        expect(classeDa(segundo, 'IAE')).toContain('badge-tag--sucesso')
        expect(segundo.findAll('td')[COLUNA.IAE].text()).toBe('0,00')
    })

    // ------------------------------------------------- detalhe aberto na linha

    it('abre com todas as linhas fechadas, para a lista caber na tela', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(false)
        expect(linhasDe(wrapper)[0].classes()).not.toContain('linha-dados--aberta')
    })

    it('clicar numa linha abre o detalhe logo abaixo dela', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await linhasDe(wrapper)[0].trigger('click')

        const detalhes = wrapper.findAll('tr.linha-detalhe')
        expect(detalhes).toHaveLength(1)
        expect(detalhes[0].find('.detalhe-titulo').text()).toContain('Município: Curitiba')
        // O detalhe ocupa a largura inteira da tabela.
        expect(detalhes[0].find('td').attributes('colspan')).toBe('10')
        expect(linhasDe(wrapper)[0].classes()).toContain('linha-dados--aberta')
        expect(wrapper.findAll('.indicador')).toHaveLength(7)
    })

    it('clicar em outra linha move o detalhe para ela', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await linhasDe(wrapper)[0].trigger('click')
        await linhasDe(wrapper)[1].trigger('click')

        const detalhes = wrapper.findAll('tr.linha-detalhe')
        expect(detalhes).toHaveLength(1)
        expect(detalhes[0].find('.detalhe-titulo').text()).toContain('Município: Ponta Grossa')
        expect(linhasDe(wrapper)[1].classes()).toContain('linha-dados--aberta')
        expect(linhasDe(wrapper)[0].classes()).not.toContain('linha-dados--aberta')
    })

    it('clicar de novo na linha aberta fecha o detalhe', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await linhasDe(wrapper)[0].trigger('click')
        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(true)

        await linhasDe(wrapper)[0].trigger('click')
        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(false)
    })

    it('o detalhe do imóvel mostra o código completo no título', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        await linhasDe(wrapper)[0].trigger('click')

        const titulo = wrapper.find('.detalhe-titulo').text()
        expect(titulo).toContain('Imóvel:')
        expect(titulo).toContain('PR-4106902-00B2EA81503E46B8BD95A7E35BBB8472')
        // A linha de apoio fica só com município e área.
        expect(wrapper.find('.detalhe-painel .detalhe').text()).toBe('Curitiba · 8,89 ha')
    })

    it('a barra usa a faixa do indicador e fica vazia quando não há cálculo', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await linhasDe(wrapper)[0].trigger('click')

        const barras = wrapper.findAll('.indicador')
        const icv = barras[BARRA.ICV].find('.preenchida')
        expect(icv.classes()).toContain('preenchida--sucesso')
        expect(icv.attributes('style')).toContain('width: 85%')

        const ifc = barras[BARRA.IFC].find('.preenchida')
        expect(ifc.classes()).toContain('preenchida--neutro')
        expect(ifc.attributes('style')).toContain('width: 0%')
        expect(barras[BARRA.IFC].find('.indicador-numero').text()).toBe('—')
    })

    it('trata densidade e percentual com escalas e rótulos diferentes', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        // Ponta Grossa tem IFC calculado (9,87) e IDESMAT 28,94.
        await linhasDe(wrapper)[1].trigger('click')

        const barras = wrapper.findAll('.indicador')

        // Percentual: escala 0–100, símbolo colado no número, duas marcas de limite.
        const idesmat = barras[BARRA.IDESMAT]
        expect(idesmat.find('.preenchida').attributes('style')).toContain('width: 28.94%')
        expect(idesmat.find('.indicador-numero').text()).toBe('28,94%')
        expect(idesmat.findAll('.limite')).toHaveLength(2)

        // Densidade: a barra mede a distância até o limite crítico (9,87 de 60 = 16,45%),
        // a unidade vai embaixo do número e a marca do limite crítico não é desenhada,
        // porque a barra cheia já significa exatamente isso.
        const ifc = barras[BARRA.IFC]
        expect(ifc.find('.preenchida').attributes('style')).toContain('width: 16.45%')
        expect(ifc.find('.indicador-numero').text()).toBe('9,87')
        expect(ifc.find('.indicador-unidade').text()).toBe('focos/1.000 ha')
        expect(ifc.findAll('.limite')).toHaveLength(1)
    })

    it('desenha uma marca só quando os dois limites coincidem', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await linhasDe(wrapper)[0].trigger('click')

        // IRL tem limite bom e limite de atenção iguais (conformidade legal é binária).
        const irl = wrapper.findAll('.indicador')[BARRA.IRL]
        expect(irl.findAll('.limite')).toHaveLength(1)
        expect(irl.find('.limite').text()).toBe('20')
    })

    it('a aba de dimensão filtra as barras sem fechar o detalhe', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await linhasDe(wrapper)[0].trigger('click')

        const abasDimensao = wrapper.findAll('.abas-dimensao .aba')
        expect(abasDimensao.map((b) => b.text())).toEqual([
            'Todas',
            'Conservação',
            'Territorial',
            'Ambiental',
        ])

        await abasDimensao[3].trigger('click') // Ambiental

        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(true)
        expect(wrapper.findAll('.indicador')).toHaveLength(2)
        expect(wrapper.find('.barras').text()).toContain('IDESMAT')
        expect(wrapper.find('.barras').text()).not.toContain('ICV')
        expect(wrapper.find('.divisor-dimensao').exists()).toBe(false)
    })

    // ------------------------------------------------------------------ navegação

    it('o botão do detalhe leva aos imóveis do município aberto', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await linhasDe(wrapper)[0].trigger('click')

        expect(wrapper.find('.btn-principal').text()).toContain('Ver os 111 imóveis de Curitiba')

        await wrapper.find('.btn-principal').trigger('click')
        await flushPromises()

        expect(listarIndicadoresPorImovel).toHaveBeenCalledTimes(1)
        expect(abas(wrapper)[1].classes()).toContain('aba-pagina--ativa')
        expect(wrapper.find('select.filtro-municipio').element.value).toBe('4106902')

        const linhas = linhasDe(wrapper)
        expect(linhas).toHaveLength(1)
        expect(linhas[0].text()).toContain('Curitiba')
        // Nada aberto ainda: o usuário escolhe qual imóvel detalhar.
        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(false)
    })

    it('o seletor de município filtra a tabela de imóveis', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        expect(linhasDe(wrapper)).toHaveLength(2)

        await wrapper.find('select.filtro-municipio').setValue('4119905')

        const linhas = linhasDe(wrapper)
        expect(linhas).toHaveLength(1)
        expect(linhas[0].text()).toContain('Ponta Grossa')
    })

    it('voltar para a aba por município descarta o filtro e fecha o detalhe', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await linhasDe(wrapper)[0].trigger('click')
        await wrapper.find('.btn-principal').trigger('click')
        await flushPromises()

        await abas(wrapper)[0].trigger('click')
        await flushPromises()

        expect(wrapper.find('select.filtro-municipio').exists()).toBe(false)
        expect(linhasDe(wrapper)).toHaveLength(2)
        expect(wrapper.find('tr.linha-detalhe').exists()).toBe(false)
    })

    // ---------------------------------------------------------------------- busca

    it('abrevia o código do imóvel na linha, mas mantém o completo no tooltip', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        const codigo = wrapper.find('tbody .codigo-imovel')
        expect(codigo.text()).toBe('…5BBB8472')
        expect(codigo.attributes('title')).toBe('PR-4106902-00B2EA81503E46B8BD95A7E35BBB8472')
    })

    it('busca pelo código completo do imóvel', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()
        await irParaImoveis(wrapper)

        await wrapper
            .find('input[type="search"]')
            .setValue('PR-4119905-0507A42A8146420983EA8718A2C69771')

        const linhas = linhasDe(wrapper)
        expect(linhas).toHaveLength(1)
        expect(linhas[0].text()).toContain('Ponta Grossa')
    })

    it('busca município ignorando acento e caixa', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await wrapper.find('input[type="search"]').setValue('PONTA grossa')

        const linhas = linhasDe(wrapper)
        expect(linhas).toHaveLength(1)
        expect(linhas[0].text()).toContain('Ponta Grossa')
    })

    it('avisa quando a busca não encontra nada', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await wrapper.find('input[type="search"]').setValue('Londrina')

        expect(wrapper.find('tbody').exists()).toBe(false)
        expect(wrapper.text()).toContain('Nada encontrado')
    })

    // ----------------------------------------------------------------------- erro

    it('mostra a mensagem de erro do serviço', async () => {
        listarIndicadoresPorMunicipio.mockRejectedValue(new Error('Acesso negado'))

        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(wrapper.find('.alerta--erro').text()).toContain('Acesso negado')
    })

    it('é somente leitura: não oferece ação de criar, editar ou excluir', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const acoes = wrapper
            .findAll('button')
            .map((b) => b.text())
            .filter((texto) => /editar|excluir|apagar|salvar|cadastrar|nov[oa]/i.test(texto))

        expect(acoes).toEqual([])
    })
})

describe('IndicadoresView — vindo do mapa (LIZARDS-35)', () => {
    it('?municipio= abre filtrado no município e com o detalhe dele aberto', async () => {
        rota.query = { municipio: '4119905' }
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(linhasDe(wrapper)).toHaveLength(1)
        expect(linhasDe(wrapper)[0].text()).toContain('Ponta Grossa')
        expect(wrapper.findAll('.linha-detalhe')).toHaveLength(1)
    })

    it('?imovel= abre na aba de imóveis com o imóvel aberto', async () => {
        rota.query = { visao: 'imovel', imovel: IMOVEIS[1].codImovel }
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(abas(wrapper)[1].classes()).toContain('aba-pagina--ativa')
        expect(listarIndicadoresPorImovel).toHaveBeenCalledTimes(1)
        expect(linhasDe(wrapper)).toHaveLength(1)
        expect(wrapper.findAll('.linha-detalhe')).toHaveLength(1)
    })

    it('código que não existe é ignorado: tela abre como sempre', async () => {
        rota.query = { municipio: '9999999' }
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(linhasDe(wrapper)).toHaveLength(2)
        expect(wrapper.find('.linha-detalhe').exists()).toBe(false)
    })
})

describe('IndicadoresView — botão Ver no mapa (LIZARDS-35)', () => {
    it('sem item aberto, volta pro mapa no recorte inteiro', async () => {
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        const botao = wrapper.get('[data-acao="ver-mapa"]')
        expect(botao.text()).toBe('Ver no mapa')
        await botao.trigger('click')
        expect(rota.push).toHaveBeenLastCalledWith({ path: '/conjuntos', query: {} })
    })

    it('com município aberto, volta pro mapa nele', async () => {
        rota.query = { municipio: '4119905' }
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await wrapper.get('[data-acao="ver-mapa"]').trigger('click')
        expect(rota.push).toHaveBeenLastCalledWith({ path: '/conjuntos', query: { municipio: '4119905' } })
    })

    it('com imóvel aberto, volta pro mapa no imóvel', async () => {
        rota.query = { visao: 'imovel', imovel: IMOVEIS[1].codImovel }
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        await wrapper.get('[data-acao="ver-mapa"]').trigger('click')
        expect(rota.push).toHaveBeenLastCalledWith({ path: '/conjuntos', query: { imovel: IMOVEIS[1].codImovel } })
    })

    it('sem permissão de ver o mapa, o botão não aparece', async () => {
        permissoes.lista = []
        const wrapper = mount(IndicadoresView)
        await flushPromises()

        expect(wrapper.find('[data-acao="ver-mapa"]').exists()).toBe(false)
    })
})

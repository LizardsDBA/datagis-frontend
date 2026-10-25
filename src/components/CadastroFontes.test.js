import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CadastroFontes from './CadastroFontes.vue'

// A tela usa router.push nos atalhos de lote/quarentena; nos testes basta um espiao.
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// Sessão de mentira: por padrão o usuário pode tudo (Operador); cada teste pode restringir.
const { sessaoTeste } = vi.hoisted(() => ({ sessaoTeste: { permissoes: [] } }))
vi.mock('../auth/autenticacao', () => ({
    temPermissao: (p) => !p || sessaoTeste.permissoes.includes(p),
    obterToken: async () => null,
    entrarNovamente: () => {},
}))
const PERMISSOES_OPERADOR = ['fonte:visualizar', 'fonte:gerenciar', 'dados:visualizar']

// Fontes de mentira cobrindo os quatro casos de agendamento que a coluna precisa mostrar.
const FONTES = [
    { id: 1, nome: 'CAR - Imóveis (PR)', orgao: 'SICAR', tipoAquisicao: 'API_REST', formatoEsperado: 'GEOJSON', cronExpressao: '0 0 2 * * ?', ativo: true },
    { id: 2, nome: 'IAT/PR - Embargos IBAMA', orgao: 'IBAMA', tipoAquisicao: 'API_REST', formatoEsperado: 'GEOJSON', cronExpressao: '0 0 3 ? * MON', ativo: true },
    { id: 3, nome: 'INPE (Queimadas)', orgao: 'INPE', tipoAquisicao: 'DOWNLOAD_URL', formatoEsperado: 'CSV', cronExpressao: '0 0 4 1 * ?', ativo: true },
    { id: 4, nome: 'CAR via Shapefile', orgao: 'SICAR', tipoAquisicao: 'UPLOAD_MANUAL', formatoEsperado: 'SHAPEFILE', cronExpressao: null, ativo: true },
    { id: 5, nome: 'Fonte com cron personalizado', orgao: 'Teste', tipoAquisicao: 'API_REST', formatoEsperado: 'GEOJSON', cronExpressao: '0 0/15 * * * ?', ativo: true },
]

let wrapper

beforeEach(() => {
    // A tela busca /api/fontes no onMounted; sem isso o teste bateria no backend.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => FONTES }))
    sessaoTeste.permissoes = PERMISSOES_OPERADOR
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

async function abrirTela() {
    wrapper = mount(CadastroFontes)
    await flushPromises()
}

describe('CadastroFontes — modal de cadastro/edição', () => {
    it('abre na lista, com o formulário fechado', async () => {
        await abrirTela()
        expect(wrapper.find('.modal-backdrop').exists()).toBe(false)
        expect(wrapper.text()).toContain('Fontes Cadastradas (5)')
    })

    it('abre o modal de cadastro pelo botão Adicionar fonte', async () => {
        await abrirTela()
        await wrapper.get('.btn-adicionar-fonte').trigger('click')
        expect(wrapper.find('.modal-backdrop').exists()).toBe(true)
        expect(wrapper.get('.modal-dialog').text()).toContain('Cadastrar Nova Fonte de Dados')
    })

    it('fecha o modal pelo botão Cancelar', async () => {
        await abrirTela()
        await wrapper.get('.btn-adicionar-fonte').trigger('click')
        await wrapper.get('.botao-secundario').trigger('click')
        expect(wrapper.find('.modal-backdrop').exists()).toBe(false)
    })

    it('abre o mesmo modal em modo edição, preenchido, ao clicar no lápis', async () => {
        await abrirTela()
        await wrapper.get('.btn-editar').trigger('click')
        const modal = wrapper.get('.modal-dialog')
        expect(modal.text()).toContain('Editar Fonte #1')
        expect(modal.get('input').element.value).toBe('CAR - Imóveis (PR)')
    })
})

describe('CadastroFontes — permissões (LIZARDS-45)', () => {
    it('quem só visualiza fontes vê a lista sem os botões de alterar, executar ou enviar arquivo', async () => {
        sessaoTeste.permissoes = ['fonte:visualizar']
        await abrirTela()
        expect(wrapper.text()).toContain('Fontes Cadastradas (5)')
        expect(wrapper.find('.btn-adicionar-fonte').exists()).toBe(false)
        expect(wrapper.find('.btn-editar').exists()).toBe(false)
        expect(wrapper.find('.btn-executar').exists()).toBe(false)
        expect(wrapper.find('.btn-conjunto-dados').exists()).toBe(false)
        // O de-para continua consultável (o modal esconde a edição)
        expect(wrapper.find('.btn-mapeamento').exists()).toBe(true)
    })

    it('o Operador vê executar e enviar arquivo em todas as fontes', async () => {
        await abrirTela()
        // 4 fontes executáveis + 1 de upload manual
        expect(wrapper.findAll('.btn-executar')).toHaveLength(5)
        expect(wrapper.findAll('.btn-conjunto-dados')).toHaveLength(5)
    })
})

describe('CadastroFontes — coluna de agendamento', () => {
    it('traduz as expressões geradas pelo construtor de cron', async () => {
        await abrirTela()
        const linhas = wrapper.findAll('.celula-agendamento')
        expect(linhas[0].text()).toContain('Todo dia às 02:00')
        expect(linhas[1].text()).toContain('Toda segunda às 03:00')
        expect(linhas[2].text()).toContain('Todo dia 1 às 04:00')
    })

    it('mostra a expressão original junto da tradução', async () => {
        await abrirTela()
        expect(wrapper.findAll('.agendamento-cron')[0].text()).toBe('0 0 2 * * ?')
    })

    it('fonte de upload sem cron aparece como por envio de arquivo e não inventa tradução para cron personalizado', async () => {
        await abrirTela()
        const linhas = wrapper.findAll('.celula-agendamento')
        // Fonte 4 é UPLOAD_MANUAL sem cron (LIZARDS-55: antes "Somente manual")
        expect(linhas[3].text()).toContain('Por envio de arquivo')
        expect(linhas[4].text()).toContain('0 0/15 * * * ?')
        expect(linhas[4].text()).not.toContain('às')
    })

    it('fonte de API sem cron aparece como sem agendamento', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [
            { id: 9, nome: 'API sem horário', tipoAquisicao: 'API_REST', cronExpressao: null, ativo: true },
        ] }))
        await abrirTela()

        const celula = wrapper.get('.celula-agendamento')
        expect(celula.text()).toContain('Sem agendamento')
        expect(celula.text()).not.toContain('Por envio de arquivo')
    })
})

describe('CadastroFontes — bloqueio de execução por mapeamento incompleto', () => {
    it('desabilita os botões de execução e upload quando o mapeamento da tabela Silver estiver incompleto', async () => {
        const fontesComStatus = [
            { id: 1, nome: 'Fonte Completa', tipoAquisicao: 'API_REST', entidadeSilver: 'imovel_rural', mapeamentoCompleto: true, totalColunasSilver: 3, totalColunasMapeadas: 3 },
            { id: 2, nome: 'Fonte Incompleta', tipoAquisicao: 'API_REST', entidadeSilver: 'imovel_rural', mapeamentoCompleto: false, totalColunasSilver: 5, totalColunasMapeadas: 2, colunasSilverFaltantes: ['area_ha', 'geometria', 'situacao'] },
            { id: 3, nome: 'Fonte Upload Incompleta', tipoAquisicao: 'UPLOAD_MANUAL', entidadeSilver: 'area_protegida', mapeamentoCompleto: false, totalColunasSilver: 4, totalColunasMapeadas: 1, colunasSilverFaltantes: ['campo_b'] },
        ]
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fontesComStatus }))
        await abrirTela()

        const botoes = wrapper.findAll('.btn-executar')
        expect(botoes).toHaveLength(3)

        // Fonte 1 (completa) -> habilitado
        expect(botoes[0].attributes('disabled')).toBeUndefined()

        // Fonte 2 (incompleta) -> desabilitado
        expect(botoes[1].attributes('disabled')).toBeDefined()
        expect(botoes[1].attributes('title')).toContain('Mapeamento incompleto: faltam 3 colunas')
        expect(botoes[1].attributes('title')).toContain('area_ha')

        // Fonte 3 (upload manual incompleto) -> desabilitado
        expect(botoes[2].attributes('disabled')).toBeDefined()
        expect(botoes[2].attributes('title')).toContain('Mapeamento incompleto')

        // Badges na tabela: apenas fontes incompletas exibem aviso (fonte OK não exibe nada)
        const badges = wrapper.findAll('.badge-mapeamento-status')
        expect(badges).toHaveLength(2)
        expect(badges[0].text()).toContain('Mapeamento Incompleto (2/5)')
        expect(badges[1].text()).toContain('Mapeamento Incompleto (1/4)')
    })
})
describe('CadastroFontes — editar e agendamento (LIZARDS-55)', () => {
    // O PUT grava a entidadeSilver que vier no corpo; sem ela, editar apagava a tabela da fonte
    it('ao editar, o salvar devolve a tabela Silver que a fonte já tinha', async () => {
        const fonte = { id: 7, nome: 'Fonte com Silver', tipoAquisicao: 'API_REST', urlOrigem: 'http://x', entidadeSilver: 'embargo_ambiental', mapeamentoCompleto: true, cronExpressao: null, ativo: true }
        const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => [fonte] })
        vi.stubGlobal('fetch', fetchFalso)
        await abrirTela()

        await wrapper.get('.btn-editar').trigger('click')
        await wrapper.get('.modal-dialog form').trigger('submit')
        await flushPromises()

        const chamadaPut = fetchFalso.mock.calls.find(([, opcoes]) => opcoes?.method === 'PUT')
        expect(chamadaPut[0]).toContain('/api/fontes/7')
        expect(JSON.parse(chamadaPut[1].body).entidadeSilver).toBe('embargo_ambiental')
    })

    it('com a atualização automática ligada e sem horário escolhido, o salvar fica bloqueado', async () => {
        await abrirTela()
        await wrapper.get('.btn-adicionar-fonte').trigger('click')
        const salvar = () => wrapper.get('.modal-dialog button[type="submit"]')

        expect(salvar().attributes('disabled')).toBeUndefined()

        // Fonte nova nasce como upload manual, que não agenda; troca para uma modalidade que agenda
        await wrapper.get('.modal-dialog select.campo-select').setValue('API_REST')
        await wrapper.get('.interruptor-entrada').setValue(true)

        expect(salvar().attributes('disabled')).toBeDefined()
    })
})

describe('CadastroFontes — casos de borda do agendamento (LIZARDS-55)', () => {
    const FONTE_AGENDADA = { id: 8, nome: 'Fonte agendada', tipoAquisicao: 'API_REST', urlOrigem: 'http://x', entidadeSilver: 'embargo_ambiental', mapeamentoCompleto: true, cronExpressao: '0 0 3 * * ?', ativo: true }

    // Antes a caixa ficava dentro de um <label>: clicar em qualquer texto dela acionava o
    // interruptor e desligava o agendamento sem a pessoa perceber
    it('clicar no texto da caixa de agendamento não desliga a atualização automática', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [FONTE_AGENDADA] }))
        wrapper = mount(CadastroFontes, { attachTo: document.body })
        await flushPromises()
        await wrapper.get('.btn-editar').trigger('click')
        const ligado = () => wrapper.get('.interruptor-entrada').element.checked
        expect(ligado()).toBe(true)

        // Um clique só: com o defeito, dois cliques desligavam e religavam, mascarando o erro
        wrapper.get('.previa').element.click()
        await flushPromises()

        expect(ligado()).toBe(true)
    })

    it('modalidade upload manual trava o agendamento e explica por quê', async () => {
        await abrirTela()
        await wrapper.get('.btn-adicionar-fonte').trigger('click')
        // O cadastro novo já nasce como upload manual
        expect(wrapper.get('.interruptor-entrada').element.disabled).toBe(true)
        expect(wrapper.get('.modal-dialog').text()).toContain('Fonte de upload manual não tem atualização automática')
    })

    it('fonte inativa com horário aparece como pausada na lista', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ ...FONTE_AGENDADA, ativo: false }] }))
        await abrirTela()

        expect(wrapper.text()).toContain('Todo dia às 03:00')
        expect(wrapper.get('.agendamento-pausado').text()).toBe('Pausado: fonte inativa')
    })

    it('fonte ativa com horário não aparece como pausada', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [FONTE_AGENDADA] }))
        await abrirTela()

        expect(wrapper.find('.agendamento-pausado').exists()).toBe(false)
    })
})

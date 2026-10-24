import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConstrutorCron from './ConstrutorCron.vue'

// LIZARDS-55: ligar/desligar a atualização automática, com a escolha feita do zero.
// O construtor emite o cron (vazio = só execução manual) e se o agendamento está completo.

let wrapper

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

function montar(modelValue = '') {
    wrapper = mount(ConstrutorCron, { props: { modelValue } })
    return wrapper
}

const ultimoCron = () => wrapper.emitted('update:modelValue').at(-1)[0]
const ultimoCompleto = () => wrapper.emitted('update:completo').at(-1)[0]
const interruptor = () => wrapper.get('.interruptor-entrada')

async function ligar() {
    await interruptor().setValue(true)
}

async function escolher(modo) {
    await wrapper.get(`input[type="radio"][value="${modo}"]`).setValue(true)
}

async function preencherHorario(hora, minuto) {
    const campos = wrapper.findAll('.campos-modo input[type="number"]')
    // Hora e minuto são sempre os dois últimos campos numéricos
    await campos.at(-2).setValue(hora)
    await campos.at(-1).setValue(minuto)
}

describe('ConstrutorCron — fonte sem horário', () => {
    it('abre desligado, sem nenhuma frequência marcada, e não grava horário sozinho', () => {
        montar('')

        expect(interruptor().element.checked).toBe(false)
        expect(wrapper.text()).toContain('Desligada')
        expect(wrapper.findAll('input[type="radio"]').every((r) => !r.element.checked)).toBe(true)
        expect(wrapper.text()).toContain('– – – –')
        // Antes da LIZARDS-55, abria em "Todo dia, 3:00" e emitia esse cron sem ninguém escolher
        expect(ultimoCron()).toBe('')
        expect(ultimoCompleto()).toBe(true)
    })

    it('desligado, as opções de frequência ficam desabilitadas', () => {
        montar('')

        expect(wrapper.findAll('input[type="radio"]').every((r) => r.element.disabled)).toBe(true)
    })
})

describe('ConstrutorCron — fonte com horário', () => {
    const modoMarcado = () => wrapper.findAll('input[type="radio"]').find((r) => r.element.checked)?.element.value
    const camposNumericos = () => wrapper.findAll('.campos-modo input[type="number"]').map((c) => c.element.value)

    it('horário diário abre em "Todo dia", com hora e minuto preenchidos', () => {
        montar('0 0 3 * * ?')

        expect(interruptor().element.checked).toBe(true)
        expect(modoMarcado()).toBe('diario')
        expect(camposNumericos()).toEqual(['3', '0'])
        expect(ultimoCron()).toBe('0 0 3 * * ?')
        expect(ultimoCompleto()).toBe(true)
    })

    it('horário semanal abre em "Toda semana", com o dia escolhido', () => {
        montar('0 30 8 ? * MON')

        expect(modoMarcado()).toBe('semanal')
        expect(wrapper.get('.campos-modo select').element.value).toBe('MON')
        expect(camposNumericos()).toEqual(['8', '30'])
        expect(ultimoCron()).toBe('0 30 8 ? * MON')
    })

    it('horário mensal abre em "Todo mês", com o dia do mês', () => {
        montar('0 0 4 15 * ?')

        expect(modoMarcado()).toBe('mensal')
        expect(camposNumericos()).toEqual(['15', '4', '0'])
        expect(ultimoCron()).toBe('0 0 4 15 * ?')
    })

    it('expressão que o construtor não gera abre em "Personalizado", com o texto', () => {
        montar('0 0/15 * * * ?')

        expect(modoMarcado()).toBe('personalizado')
        expect(wrapper.get('.texto-personalizado').element.value).toBe('0 0/15 * * * ?')
        expect(ultimoCron()).toBe('0 0/15 * * * ?')
        expect(ultimoCompleto()).toBe(true)
    })

    it('horário fora do intervalo não é aceito como diário e abre em "Personalizado"', () => {
        montar('0 0 25 * * ?')

        expect(modoMarcado()).toBe('personalizado')
    })

    it('desligar limpa o horário: a fonte passa a ser só manual', async () => {
        montar('0 0 2 * * ?')

        await interruptor().setValue(false)

        expect(ultimoCron()).toBe('')
        expect(ultimoCompleto()).toBe(true)
        expect(wrapper.text()).toContain('sem agendamento')
    })
})

describe('ConstrutorCron — ligar e escolher do zero', () => {
    it('ao ligar, nada vem preenchido e o agendamento fica incompleto', async () => {
        montar('')

        await ligar()

        expect(wrapper.findAll('input[type="radio"]').every((r) => !r.element.checked)).toBe(true)
        expect(ultimoCron()).toBe('')
        expect(ultimoCompleto()).toBe(false)
        expect(wrapper.find('.aviso-incompleto').exists()).toBe(true)
    })

    it('todo dia: só completa depois de hora e minuto preenchidos', async () => {
        montar('')
        await ligar()
        await escolher('diario')

        expect(ultimoCompleto()).toBe(false)

        await preencherHorario(3, 0)

        expect(ultimoCron()).toBe('0 0 3 * * ?')
        expect(ultimoCompleto()).toBe(true)
        expect(wrapper.find('.aviso-incompleto').exists()).toBe(false)
    })

    it('hora ou minuto fora do intervalo deixam o agendamento incompleto', async () => {
        montar('')
        await ligar()
        await escolher('diario')

        await preencherHorario(25, 0)
        expect(ultimoCompleto()).toBe(false)
        expect(ultimoCron()).toBe('')

        await preencherHorario(3, 60)
        expect(ultimoCompleto()).toBe(false)
    })

    it('toda semana: precisa do dia escolhido, além do horário', async () => {
        montar('')
        await ligar()
        await escolher('semanal')
        await preencherHorario(8, 30)

        expect(ultimoCompleto()).toBe(false)

        await wrapper.get('.campos-modo select').setValue('MON')

        expect(ultimoCron()).toBe('0 30 8 ? * MON')
        expect(ultimoCompleto()).toBe(true)
    })

    it('todo mês: precisa do dia do mês entre 1 e 31', async () => {
        montar('')
        await ligar()
        await escolher('mensal')
        await preencherHorario(4, 0)
        const diaDoMes = wrapper.findAll('.campos-modo input[type="number"]').at(0)

        await diaDoMes.setValue(32)
        expect(ultimoCompleto()).toBe(false)

        await diaDoMes.setValue(1)
        expect(ultimoCron()).toBe('0 0 4 1 * ?')
        expect(ultimoCompleto()).toBe(true)
    })

    it('personalizado: completa com a expressão digitada', async () => {
        montar('')
        await ligar()
        await escolher('personalizado')

        expect(ultimoCompleto()).toBe(false)

        await wrapper.get('.texto-personalizado').setValue('0 0/30 * * * ?')

        expect(ultimoCron()).toBe('0 0/30 * * * ?')
        expect(ultimoCompleto()).toBe(true)
    })

    it('desligar e religar volta do zero, sem o horário anterior', async () => {
        montar('')
        await ligar()
        await escolher('diario')
        await preencherHorario(3, 0)

        await interruptor().setValue(false)
        await ligar()

        expect(wrapper.findAll('input[type="radio"]').every((r) => !r.element.checked)).toBe(true)
        expect(ultimoCron()).toBe('')
        expect(ultimoCompleto()).toBe(false)
    })
})

describe('ConstrutorCron — o que nunca pode sair', () => {
    it('nunca emite "* * * * * ?" (no Quartz dispararia a cada segundo)', async () => {
        montar('')
        await ligar()
        await interruptor().setValue(false)

        const emitidos = wrapper.emitted('update:modelValue').map(([valor]) => valor)
        expect(emitidos).not.toContain('* * * * * ?')
        expect(emitidos.every((valor) => valor === '')).toBe(true)
    })
})

describe('ConstrutorCron — bloqueado (ex.: fonte de upload manual)', () => {
    const MOTIVO = 'Fonte de upload manual não tem atualização automática'

    it('fica desligado e travado, mostrando o motivo', () => {
        wrapper = mount(ConstrutorCron, { props: { modelValue: '', bloqueado: true, motivoBloqueio: MOTIVO } })

        expect(interruptor().element.checked).toBe(false)
        expect(interruptor().element.disabled).toBe(true)
        expect(wrapper.text()).toContain(MOTIVO)
        expect(ultimoCron()).toBe('')
        expect(ultimoCompleto()).toBe(true)
    })

    it('fonte que já tinha horário e está bloqueada perde o horário', () => {
        wrapper = mount(ConstrutorCron, { props: { modelValue: '0 0 3 * * ?', bloqueado: true } })

        expect(interruptor().element.checked).toBe(false)
        expect(ultimoCron()).toBe('')
    })

    it('bloqueado, um horário que chegue de fora não religa e é devolvido vazio', async () => {
        wrapper = mount(ConstrutorCron, { props: { modelValue: '', bloqueado: true } })

        await wrapper.setProps({ modelValue: '0 0 3 * * ?' })

        expect(interruptor().element.checked).toBe(false)
        expect(ultimoCron()).toBe('')
    })

    it('passar a ser bloqueado (troca de modalidade) desliga e limpa o horário escolhido', async () => {
        montar('')
        await ligar()
        await escolher('diario')
        await preencherHorario(3, 0)
        expect(ultimoCron()).toBe('0 0 3 * * ?')

        await wrapper.setProps({ bloqueado: true })

        expect(interruptor().element.checked).toBe(false)
        expect(ultimoCron()).toBe('')
    })
})

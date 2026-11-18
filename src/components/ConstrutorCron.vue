<script setup>
// Painel guiado pra montar uma expressao cron do Quartz (6 campos: segundo minuto
// hora dia-do-mes mes dia-da-semana) sem precisar saber a sintaxe de cor. O campo de
// texto continua editavel direto no modo "Personalizado" — ninguem fica preso ao
// construtor se precisar de algo que ele nao cobre. O valor alimenta o agendamento
// do Quartz (LIZARDS-10): o AgendadorInicializacaoRunner le fonte_dado.cron_expressao
// na subida do backend e cria o trigger de cada fonte ativa.
//
// Ligar/desligar (LIZARDS-55): desligado, o valor emitido e vazio - a fonte fica so com
// execucao manual e o backend remove o agendamento. Fonte sem horario abre desligada;
// antes, o construtor abria em "Todo dia, 3:00" e gravava esse horario sozinho ao salvar.
// Ligado, nada vem preenchido: a pessoa escolhe frequencia e horario, e enquanto falta
// algo o v-model:completo fica falso (o formulario bloqueia o salvar).
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // Ex.: fonte de upload manual - não há de onde buscar dado novo, então não se agenda
  bloqueado: { type: Boolean, default: false },
  motivoBloqueio: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'update:completo'])

const ligado = ref(Boolean(props.modelValue))
const modo = ref(null)
const hora = ref(null)
const minuto = ref(null)
const diaDaSemana = ref(null)
const diaDoMes = ref(null)
const textoPersonalizado = ref('')

const DIAS_VALIDOS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Reconhece os três formatos que o próprio construtor gera e abre no modo certo, com os
// campos preenchidos; qualquer outra expressão abre em "Personalizado", como antes.
function carregar(cron) {
  const diario = cron.match(/^0 (\d{1,2}) (\d{1,2}) \* \* \?$/)
  const semanal = cron.match(/^0 (\d{1,2}) (\d{1,2}) \? \* ([A-Z]{3})$/)
  const mensal = cron.match(/^0 (\d{1,2}) (\d{1,2}) (\d{1,2}) \* \?$/)
  const horario = (m) => noIntervalo(Number(m[2]), 0, 23) && noIntervalo(Number(m[1]), 0, 59)

  if (diario && horario(diario)) {
    modo.value = 'diario'
  } else if (semanal && horario(semanal) && DIAS_VALIDOS.includes(semanal[3])) {
    modo.value = 'semanal'
    diaDaSemana.value = semanal[3]
  } else if (mensal && horario(mensal) && noIntervalo(Number(mensal[3]), 1, 31)) {
    modo.value = 'mensal'
    diaDoMes.value = Number(mensal[3])
  } else {
    modo.value = 'personalizado'
    textoPersonalizado.value = cron
    return
  }
  const partes = diario || semanal || mensal
  minuto.value = Number(partes[1])
  hora.value = Number(partes[2])
}

const diasDaSemana = [
  { valor: 'MON', rotulo: 'Segunda' },
  { valor: 'TUE', rotulo: 'Terça' },
  { valor: 'WED', rotulo: 'Quarta' },
  { valor: 'THU', rotulo: 'Quinta' },
  { valor: 'FRI', rotulo: 'Sexta' },
  { valor: 'SAT', rotulo: 'Sábado' },
  { valor: 'SUN', rotulo: 'Domingo' },
]

// Desligado, nenhuma opcao aparece marcada
const modoExibido = computed({
  get: () => (ligado.value ? modo.value : null),
  set: (valor) => {
    modo.value = valor
  },
})

function noIntervalo(valor, minimo, maximo) {
  return Number.isInteger(valor) && valor >= minimo && valor <= maximo
}

if (props.modelValue) carregar(props.modelValue)

const horarioValido = computed(() => noIntervalo(hora.value, 0, 23) && noIntervalo(minuto.value, 0, 59))

const cronGerado = computed(() => {
  // Vazio, e nunca "* * * * * ?": no Quartz isso dispararia a cada segundo.
  // Ligado mas incompleto também sai vazio - o formulário é que não deixa salvar.
  if (!ligado.value) return ''
  switch (modo.value) {
    case 'diario':
      return horarioValido.value ? `0 ${minuto.value} ${hora.value} * * ?` : ''
    case 'semanal':
      return horarioValido.value && diaDaSemana.value
        ? `0 ${minuto.value} ${hora.value} ? * ${diaDaSemana.value}`
        : ''
    case 'mensal':
      return horarioValido.value && noIntervalo(diaDoMes.value, 1, 31)
        ? `0 ${minuto.value} ${hora.value} ${diaDoMes.value} * ?`
        : ''
    case 'personalizado':
      return textoPersonalizado.value.trim()
    default:
      return ''
  }
})

// Desligado está sempre completo (fonte manual); ligado, só com a expressão montada
const completo = computed(() => !ligado.value || cronGerado.value !== '')

watch(cronGerado, (novo) => emit('update:modelValue', novo), { immediate: true })
watch(completo, (valor) => emit('update:completo', valor), { immediate: true })

// Desligar limpa tudo: ao religar, a escolha começa do zero
function limparEscolha() {
  modo.value = null
  hora.value = null
  minuto.value = null
  diaDaSemana.value = null
  diaDoMes.value = null
  textoPersonalizado.value = ''
}

watch(ligado, (agora) => {
  if (!agora) limparEscolha()
})

// Bloqueado (ou passou a ser, ao trocar a modalidade), o agendamento é desligado e limpo
watch(
  () => props.bloqueado,
  (bloqueado) => {
    if (bloqueado) ligado.value = false
  },
  { immediate: true },
)

// Se o formulario mudar o valor por fora (ex.: reset depois de salvar), acompanha.
// O que o proprio construtor emitiu volta igual e e ignorado.
watch(() => props.modelValue, (novo) => {
  if ((novo || '') === cronGerado.value) return
  // Bloqueado não religa: um horário que chegue de fora é devolvido vazio
  if (props.bloqueado) {
    if (novo) emit('update:modelValue', '')
    return
  }
  if (novo) {
    limparEscolha()
    ligado.value = true
    carregar(novo)
  } else {
    ligado.value = false
  }
})
</script>

<template>
  <div class="construtor-cron" :class="{ 'construtor-cron--desligado': !ligado }">
    <label class="interruptor">
      <input v-model="ligado" type="checkbox" role="switch" class="interruptor-entrada" :disabled="bloqueado" />
      <span class="interruptor-trilho" aria-hidden="true"></span>
      <span class="interruptor-texto">
        Atualização automática:
        <strong>{{ ligado ? 'Ligada' : 'Desligada' }}</strong>
        <span v-if="!ligado" class="interruptor-dica">&nbsp;— só execução manual</span>
      </span>
    </label>

    <div class="opcoes-modo">
      <label class="opcao-modo">
        <input v-model="modoExibido" type="radio" value="diario" :disabled="!ligado" /> Todo dia
      </label>
      <label class="opcao-modo">
        <input v-model="modoExibido" type="radio" value="semanal" :disabled="!ligado" /> Toda semana
      </label>
      <label class="opcao-modo">
        <input v-model="modoExibido" type="radio" value="mensal" :disabled="!ligado" /> Todo mês
      </label>
      <label class="opcao-modo">
        <input v-model="modoExibido" type="radio" value="personalizado" :disabled="!ligado" /> Personalizado
      </label>
    </div>

    <div v-if="!ligado" class="campos-modo">
      <label class="campo-inline">
        Hora
        <input value="–" disabled />
      </label>
      <label class="campo-inline">
        Minuto
        <input value="–" disabled />
      </label>
    </div>

    <div v-else-if="modo && modo !== 'personalizado'" class="campos-modo">
      <label v-if="modo === 'semanal'" class="campo-inline">
        Dia
        <select v-model="diaDaSemana">
          <option :value="null" disabled>Escolha</option>
          <option v-for="d in diasDaSemana" :key="d.valor" :value="d.valor">{{ d.rotulo }}</option>
        </select>
      </label>
      <label v-if="modo === 'mensal'" class="campo-inline">
        Dia do mês
        <input v-model.number="diaDoMes" type="number" min="1" max="31" placeholder="1–31" />
      </label>
      <label class="campo-inline">
        Hora
        <input v-model.number="hora" type="number" min="0" max="23" placeholder="0–23" />
      </label>
      <label class="campo-inline">
        Minuto
        <input v-model.number="minuto" type="number" min="0" max="59" placeholder="0–59" />
      </label>
    </div>

    <input
      v-if="ligado && modo === 'personalizado'"
      v-model="textoPersonalizado"
      class="texto-personalizado"
      placeholder="0 0 3 * * ?"
    />

    <p v-if="bloqueado && motivoBloqueio" class="aviso-bloqueio">{{ motivoBloqueio }}</p>

    <p v-if="!completo" class="aviso-incompleto" role="alert">
      Escolha a frequência e o horário para ligar a atualização automática.
    </p>

    <p class="previa">
      Expressão gerada:
      <code v-if="ligado">{{ cronGerado || '—' }}</code>
      <template v-else><code>– – – –</code> (sem agendamento)</template>
    </p>
  </div>
</template>

<style scoped src="../styles/components/ConstrutorCron.css"></style>

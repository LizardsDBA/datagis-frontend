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
const modo = ref(props.modelValue ? 'personalizado' : null)
const hora = ref(null)
const minuto = ref(null)
const diaDaSemana = ref(null)
const diaDoMes = ref(null)
const textoPersonalizado = ref(props.modelValue || '')

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
  if (novo) {
    ligado.value = true
    modo.value = 'personalizado'
    textoPersonalizado.value = novo
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

<style scoped>
.construtor-cron {
  border: 1px dashed #d5d9dd;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.opcoes-modo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.8rem;
}

.opcao-modo {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: #444;
  cursor: pointer;
}

.campos-modo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.campo-inline {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.78rem;
  color: #555;
}

.campo-inline input,
.campo-inline select {
  width: 6rem;
  padding: 0.35rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: inherit;
}

.texto-personalizado {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: inherit;
}

.previa {
  margin: 0;
  font-size: 0.78rem;
  color: #666;
}

.previa code {
  background: #f1f3f4;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  color: #2e7d32;
}

/* Interruptor ligar/desligar da atualização automática (LIZARDS-55) */
.interruptor {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.82rem;
  color: #444;
  cursor: pointer;
  user-select: none;
}

.interruptor-entrada {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.interruptor-trilho {
  position: relative;
  flex-shrink: 0;
  width: 2.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.15s ease;
}

.interruptor-trilho::after {
  content: '';
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}

.interruptor-entrada:checked + .interruptor-trilho {
  background: #15803d;
}

.interruptor-entrada:checked + .interruptor-trilho::after {
  transform: translateX(1rem);
}

.interruptor-entrada:focus-visible + .interruptor-trilho {
  outline: 2px solid #15803d;
  outline-offset: 2px;
}

.interruptor-dica {
  color: #666;
}

.interruptor-entrada:disabled + .interruptor-trilho {
  opacity: 0.5;
  cursor: not-allowed;
}

.aviso-bloqueio {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
}

.aviso-incompleto {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
}

.construtor-cron--desligado .opcao-modo,
.construtor-cron--desligado .campo-inline {
  opacity: 0.55;
  cursor: not-allowed;
}
/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .construtor-cron {
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .opcao-modo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo-inline {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo-inline input,
:root[data-tema="escuro"] .campo-inline select {
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .texto-personalizado {
  border-color: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .previa {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .previa code {
  background: var(--cor-superficie-elevada);
  color: var(--cor-link);
}

:root[data-tema="escuro"] .interruptor {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .interruptor-trilho {
  background: var(--cor-borda-forte);
}

:root[data-tema="escuro"] .interruptor-entrada:checked + .interruptor-trilho {
  background: var(--cor-primaria);
}

:root[data-tema="escuro"] .interruptor-entrada:focus-visible + .interruptor-trilho {
  outline-color: var(--cor-primaria);
}

:root[data-tema="escuro"] .interruptor-dica {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .aviso-incompleto {
  color: var(--cor-alerta);
}

:root[data-tema="escuro"] .aviso-bloqueio {
  color: var(--cor-texto-terciario);
}
</style>

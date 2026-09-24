<script setup>
// Painel guiado pra montar uma expressao cron do Quartz (6 campos: segundo minuto
// hora dia-do-mes mes dia-da-semana) sem precisar saber a sintaxe de cor. O campo de
// texto continua editavel direto no modo "Personalizado" — ninguem fica preso ao
// construtor se precisar de algo que ele nao cobre. O valor alimenta o agendamento
// do Quartz (LIZARDS-10): o AgendadorInicializacaoRunner le fonte_dado.cron_expressao
// na subida do backend e cria o trigger de cada fonte ativa.
import { ref, computed, watch } from 'vue'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const modo = ref(props.modelValue ? 'personalizado' : 'diario')
const hora = ref(3)
const minuto = ref(0)
const diaDaSemana = ref('MON')
const diaDoMes = ref(1)
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

const cronGerado = computed(() => {
  switch (modo.value) {
    case 'diario':
      return `0 ${minuto.value} ${hora.value} * * ?`
    case 'semanal':
      return `0 ${minuto.value} ${hora.value} ? * ${diaDaSemana.value}`
    case 'mensal':
      return `0 ${minuto.value} ${hora.value} ${diaDoMes.value} * ?`
    default:
      return textoPersonalizado.value
  }
})

watch(cronGerado, (novo) => emit('update:modelValue', novo), { immediate: true })

// Se o formulario for resetado por fora (ex.: depois de salvar), acompanha.
watch(() => props.modelValue, (novo) => {
  if (modo.value === 'personalizado' && novo !== textoPersonalizado.value) {
    textoPersonalizado.value = novo || ''
  }
  if (!novo) {
    modo.value = 'diario'
  }
})
</script>

<template>
  <div class="construtor-cron">
    <div class="opcoes-modo">
      <label class="opcao-modo">
        <input v-model="modo" type="radio" value="diario" /> Todo dia
      </label>
      <label class="opcao-modo">
        <input v-model="modo" type="radio" value="semanal" /> Toda semana
      </label>
      <label class="opcao-modo">
        <input v-model="modo" type="radio" value="mensal" /> Todo mês
      </label>
      <label class="opcao-modo">
        <input v-model="modo" type="radio" value="personalizado" /> Personalizado
      </label>
    </div>

    <div v-if="modo !== 'personalizado'" class="campos-modo">
      <label v-if="modo === 'semanal'" class="campo-inline">
        Dia
        <select v-model="diaDaSemana">
          <option v-for="d in diasDaSemana" :key="d.valor" :value="d.valor">{{ d.rotulo }}</option>
        </select>
      </label>
      <label v-if="modo === 'mensal'" class="campo-inline">
        Dia do mês
        <input v-model.number="diaDoMes" type="number" min="1" max="31" />
      </label>
      <label class="campo-inline">
        Hora
        <input v-model.number="hora" type="number" min="0" max="23" />
      </label>
      <label class="campo-inline">
        Minuto
        <input v-model.number="minuto" type="number" min="0" max="59" />
      </label>
    </div>

    <input
      v-if="modo === 'personalizado'"
      v-model="textoPersonalizado"
      class="texto-personalizado"
      placeholder="0 0 3 * * ?"
    />

    <p class="previa">
      Expressão gerada: <code>{{ cronGerado || '—' }}</code>
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
</style>

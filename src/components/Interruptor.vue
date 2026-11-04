<script setup>
/**
 * Interruptor liga/desliga (role="switch"). Com `somenteLeitura` mostra o estado e não muda.
 */
defineProps({
  modelValue: { type: Boolean, default: false },
  rotulo: { type: String, required: true },
  somenteLeitura: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <button
    type="button"
    role="switch"
    class="interruptor"
    :class="{ 'interruptor--ligado': modelValue, 'interruptor--leitura': somenteLeitura }"
    :aria-checked="modelValue"
    :aria-label="rotulo"
    :aria-readonly="somenteLeitura"
    :disabled="somenteLeitura"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="interruptor-bolinha" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.interruptor {
  position: relative;
  width: 2.6rem;
  height: 1.45rem;
  padding: 0;
  border: none;
  border-radius: var(--raio-full);
  background: var(--cor-slate-300);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.interruptor--ligado {
  background: var(--cor-primaria);
}

.interruptor--leitura {
  cursor: not-allowed;
  opacity: 0.6;
}

.interruptor-bolinha {
  position: absolute;
  top: 0.18rem;
  left: 0.18rem;
  width: 1.09rem;
  height: 1.09rem;
  border-radius: 50%;
  background: var(--cor-branco);
  box-shadow: var(--sombra-sm);
  transition: transform 0.15s ease;
}

.interruptor--ligado .interruptor-bolinha {
  transform: translateX(1.15rem);
}

/* Escuro: --cor-branco vira superfície escura; a bolinha precisa ficar clara */
:root[data-tema="escuro"] .interruptor-bolinha {
  background: var(--cor-texto);
}

.interruptor:focus-visible {
  outline: 2px solid var(--cor-primaria);
  outline-offset: 2px;
}
</style>

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

<style scoped src="../styles/components/Interruptor.css"></style>

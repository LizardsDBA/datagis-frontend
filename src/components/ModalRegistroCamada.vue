<script setup>
/**
 * Modal simples e isolado (não reaproveita DetalheQuarentenaModal.vue de propósito) pra
 * mostrar um único registro, já normalizado como objeto chave/valor pelo componente pai
 * — funciona tanto pra um RegistroCamadaDto.dados (Bronze/Silver) quanto pra um
 * ItemQuarentenaDto remodelado, já que os dois formatos são bem diferentes na origem.
 */
defineProps({
  titulo: { type: String, default: 'Registro' },
  dados: { type: Object, default: null },
  mensagemVazio: {
    type: String,
    default: 'Este registro não está presente nessa camada.',
  },
})
const emit = defineEmits(['fechar'])
</script>

<template>
  <div class="fundo-modal" @click.self="emit('fechar')">
    <div class="caixa-modal">
      <div class="cabecalho-modal">
        <h3>{{ titulo }}</h3>
        <button class="botao-fechar" @click="emit('fechar')" aria-label="Fechar">✕</button>
      </div>

      <div v-if="!dados" class="estado-vazio">{{ mensagemVazio }}</div>

      <table v-else class="tabela-chave-valor">
        <tbody>
          <tr v-for="(valor, chave) in dados" :key="chave">
            <th>{{ chave }}</th>
            <td>{{ valor === null || valor === undefined ? '—' : String(valor) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped src="../styles/modals/ModalRegistroCamada.css"></style>

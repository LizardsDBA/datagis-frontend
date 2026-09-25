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

<style scoped>
.fundo-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.caixa-modal {
  background: #ffffff;
  border-radius: 12px;
  width: min(600px, 100%);
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.cabecalho-modal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: #ffffff;
}

.cabecalho-modal h3 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}

.botao-fechar {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #64748b;
}

.estado-vazio {
  padding: 2rem 1.1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
}

.tabela-chave-valor {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tabela-chave-valor th,
.tabela-chave-valor td {
  padding: 0.55rem 1.1rem;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
}

.tabela-chave-valor th {
  color: #64748b;
  font-weight: 600;
  white-space: nowrap;
  width: 40%;
}

.tabela-chave-valor td {
  color: #1e293b;
  word-break: break-word;
}
</style>

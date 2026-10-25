<script setup>
import { sair, sessao } from '../auth/autenticacao'
</script>

<template>
  <section class="sem-acesso">
    <div class="cartao">
      <h1>Sem acesso liberado</h1>
      <p>
        O usuário <strong>{{ sessao.login }}</strong> está autenticado, mas ainda não tem nenhum perfil ou
        permissão atribuído no DataGIS.
      </p>
      <p>Peça a um administrador para liberar o seu acesso e entre novamente.</p>
      <button class="btn-sair" @click="sair">Sair</button>
    </div>
  </section>
</template>

<style scoped>
.sem-acesso {
  display: flex;
  justify-content: center;
  padding-top: 4rem;
}

.cartao {
  max-width: 32rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

h1 {
  font-size: 1.25rem;
  color: #0f172a;
  margin: 0 0 1rem;
}

p {
  color: #475569;
  line-height: 1.5;
}

.btn-sair {
  margin-top: 1rem;
  background: #0f172a;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}
/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .cartao {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] h1 {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] p {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .btn-sair {
  background: var(--cor-fundo);
}
</style>

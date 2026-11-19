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

<style scoped src="../styles/views/SemAcessoView.css"></style>

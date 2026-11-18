<script setup>
/**
 * Perfis (somente consulta): o que cada perfil libera, agrupado por área, e quem tem cada
 * perfil. Os perfis são definidos no código (enum Perfil do backend) e o backend os
 * reaplica no Keycloak a cada subida; por isso não há edição por aqui.
 */
import { computed, onMounted, ref } from 'vue'
import { buscarCatalogoAcesso, buscarUsuarios } from '../services/usuarioService'
import { acaoDaPermissao, areaDaPermissao } from '../auth/rotulosAcesso'

const catalogo = ref({ perfis: [], permissoes: [] })
const usuarios = ref([])
const carregando = ref(true)
const erro = ref('')

const descricaoPermissao = computed(() =>
  Object.fromEntries(catalogo.value.permissoes.map((p) => [p.codigo, p.descricao])),
)

function agruparPorArea(codigos) {
  const grupos = new Map()
  // Mantém a ordem do catálogo, não a do perfil, pra todos os cards seguirem a mesma ordem
  catalogo.value.permissoes
    .filter((p) => codigos.includes(p.codigo))
    .forEach((p) => {
      const area = areaDaPermissao(p.codigo)
      if (!grupos.has(area)) grupos.set(area, [])
      grupos.get(area).push(p.codigo)
    })
  return [...grupos].map(([area, permissoes]) => ({ area, permissoes }))
}

const perfis = computed(() =>
  catalogo.value.perfis.map((perfil) => ({
    ...perfil,
    areas: agruparPorArea(perfil.permissoes),
    usuarios: usuarios.value.filter((u) => u.perfis.includes(perfil.codigo)),
  })),
)

const semPerfil = computed(() => usuarios.value.filter((u) => !u.perfis.length))

onMounted(async () => {
  try {
    const [cat, lista] = await Promise.all([buscarCatalogoAcesso(), buscarUsuarios()])
    catalogo.value = cat
    usuarios.value = lista
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
})
</script>

<template>
  <div class="pagina-acesso">
    <router-link to="/admin/controle-acesso" class="link-voltar">← Controle de Acesso</router-link>
    <header>
      <p class="etiqueta">CONTROLE DE ACESSO</p>
      <h1 class="titulo">Perfis</h1>
      <p class="subtitulo">
        Cada perfil é um pacote de permissões. Um usuário pode ter vários perfis e ainda permissões avulsas, que se
        atribuem na tela de Usuários.
      </p>
    </header>

    <p class="aviso-leitura">
      Tela somente de consulta. Os perfis são definidos no código do sistema e reaplicados no Keycloak sempre que o
      backend sobe; mudar a composição de um perfil é uma alteração de código, revisada e testada.
    </p>

    <div v-if="erro" class="alerta-erro">✕ {{ erro }}</div>
    <p v-else-if="carregando" class="estado-vazio">Carregando perfis…</p>

    <template v-else>
      <section v-for="perfil in perfis" :key="perfil.codigo" class="card-secao card-perfil">
        <header class="perfil-topo">
          <div>
            <h2 class="perfil-nome">{{ perfil.nome }}</h2>
            <p class="perfil-descricao">{{ perfil.descricao }}</p>
          </div>
          <div class="perfil-numeros">
            <span><strong>{{ perfil.permissoes.length }}</strong> permissões</span>
            <span><strong>{{ perfil.usuarios.length }}</strong> usuário(s)</span>
          </div>
        </header>

        <div class="perfil-corpo">
          <div class="perfil-areas">
            <h3 class="bloco-titulo">O que libera</h3>
            <dl class="lista-areas">
              <template v-for="grupo in perfil.areas" :key="grupo.area">
                <dt>{{ grupo.area }}</dt>
                <dd>
                  <span
                    v-for="codigo in grupo.permissoes"
                    :key="codigo"
                    class="item-permissao"
                    :title="codigo"
                  >
                    <span class="badge badge--permissao">{{ acaoDaPermissao(codigo) }}</span>
                    {{ descricaoPermissao[codigo] }}
                  </span>
                </dd>
              </template>
            </dl>
          </div>

          <div class="perfil-usuarios">
            <h3 class="bloco-titulo">Quem tem este perfil</h3>
            <p v-if="!perfil.usuarios.length" class="texto-fraco">Nenhum usuário.</p>
            <ul v-else class="lista-usuarios">
              <li v-for="usuario in perfil.usuarios" :key="usuario.id">
                <span class="usuario-login">{{ usuario.login }}</span>
                <span class="texto-fraco">{{ [usuario.nome, usuario.sobrenome].filter(Boolean).join(' ') }}</span>
                <span v-if="!usuario.ativo" class="badge badge--erro">Inativo</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section v-if="semPerfil.length" class="card-secao">
        <h2 class="perfil-nome">Usuários sem perfil</h2>
        <p class="perfil-descricao">
          Têm só permissões avulsas, ou nenhuma (nesse caso não veem nenhuma tela).
        </p>
        <ul class="lista-usuarios">
          <li v-for="usuario in semPerfil" :key="usuario.id">
            <span class="usuario-login">{{ usuario.login }}</span>
            <span class="texto-fraco">{{ usuario.permissoesAvulsas.length }} permissão(ões) avulsa(s)</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped src="../styles/views/PerfisAcessoView.css"></style>

<script setup>
/**
 * Painel do Controle de Acesso: um card por tela (usuários, perfis e matriz de acesso), com
 * um número de resumo em cada. Os números são carregados em paralelo e cada um falha
 * sozinho: se a lista de usuários não responder, os cards de perfis e matriz continuam.
 */
import { computed, onMounted, ref } from 'vue'
import { buscarCatalogoAcesso, buscarUsuarios } from '../services/usuarioService'

const usuarios = ref(null)
const catalogo = ref(null)

const resumoUsuarios = computed(() => {
  if (!usuarios.value) return null
  const ativos = usuarios.value.filter((u) => u.ativo).length
  return `${usuarios.value.length} cadastrado(s) · ${ativos} ativo(s)`
})

const resumoPerfis = computed(() => (catalogo.value ? `${catalogo.value.perfis.length} perfis` : null))
const resumoMatriz = computed(() => (catalogo.value ? `${catalogo.value.permissoes.length} permissões` : null))

const cards = computed(() => [
  {
    rota: '/admin/usuarios',
    titulo: 'Usuários',
    icone: 'usuarios',
    descricao:
      'Cadastro dos usuários que acessam o sistema, com os perfis e as permissões avulsas de cada um. Também importa e exporta a lista.',
    resumo: resumoUsuarios.value,
  },
  {
    rota: '/admin/perfis',
    titulo: 'Perfis',
    icone: 'perfis',
    descricao:
      'Os pacotes de permissões (Administrador, Operador, Analista, Auditor): o que cada um libera e quem tem cada perfil. Somente consulta.',
    resumo: resumoPerfis.value,
  },
  {
    rota: '/admin/matriz-acesso',
    titulo: 'Matriz de Acesso',
    icone: 'matriz',
    descricao:
      'Cada permissão do sistema, os perfis que a incluem e as telas que ela libera. Mostra quem pode fazer o quê. Somente consulta.',
    resumo: resumoMatriz.value,
  },
])

onMounted(async () => {
  const [lista, cat] = await Promise.allSettled([buscarUsuarios(), buscarCatalogoAcesso()])
  if (lista.status === 'fulfilled') usuarios.value = lista.value
  if (cat.status === 'fulfilled') catalogo.value = cat.value
})
</script>

<template>
  <div class="pagina-acesso">
    <header>
      <p class="etiqueta">ADMINISTRAÇÃO</p>
      <h1 class="titulo">Controle de Acesso</h1>
      <p class="subtitulo">
        Quem pode entrar no DataGIS e o que cada um pode fazer. Escolha uma das áreas abaixo.
      </p>
    </header>

    <div class="grade-cards">
      <router-link v-for="card in cards" :key="card.rota" :to="card.rota" class="card-area">
        <div class="card-topo">
          <span class="card-icone" aria-hidden="true">
            <svg v-if="card.icone === 'usuarios'" viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6" />
            </svg>
            <svg v-else-if="card.icone === 'perfis'" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="11" r="2.5" />
              <path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          <h2 class="card-titulo">{{ card.titulo }}</h2>
          <span class="card-abrir" aria-hidden="true">→</span>
        </div>
        <p class="card-descricao">{{ card.descricao }}</p>
        <p class="card-resumo">{{ card.resumo ?? '—' }}</p>
      </router-link>
    </div>
  </div>
</template>

<style scoped src="./controleAcesso.css"></style>

<style scoped>
.grade-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
  gap: 1.25rem;
}

.card-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--cor-branco);
  border: 1px solid var(--cor-slate-200);
  box-shadow: var(--sombra-sm);
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.card-area:hover,
.card-area:focus-visible {
  border-color: var(--cor-primaria);
  box-shadow: var(--sombra-md);
  outline: none;
}

.card-topo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--cor-slate-100);
}

.card-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 8px;
  background: var(--cor-primaria-clara);
  color: var(--cor-primaria);
}

.card-icone svg {
  width: 1.3rem;
  height: 1.3rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.card-titulo {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--cor-slate-900);
}

.card-abrir {
  font-size: 1.2rem;
  color: var(--cor-slate-400);
}

.card-area:hover .card-abrir {
  color: var(--cor-primaria);
}

.card-descricao {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--cor-slate-600);
}

.card-resumo {
  margin: auto 0 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--cor-slate-500);
}
</style>

<script setup>
/**
 * Matriz de Acesso (somente consulta): uma linha por permissão, uma coluna por perfil, e as
 * telas que a permissão libera. As telas vêm das próprias rotas (meta.permissao +
 * meta.titulo do router), então rota nova aparece aqui sozinha. Botões de ação dentro das
 * telas (salvar, liberar lote...) seguem a permissão de "gerenciar"/"tratar" da mesma área.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buscarCatalogoAcesso } from '../services/usuarioService'
import { acaoDaPermissao, areaDaPermissao } from '../auth/rotulosAcesso'

const router = useRouter()
const catalogo = ref({ perfis: [], permissoes: [] })
const carregando = ref(true)
const erro = ref('')

const telasPorPermissao = computed(() => {
  const mapa = {}
  router.getRoutes().forEach((rota) => {
    const { permissao, titulo } = rota.meta || {}
    if (!permissao || !titulo) return
    ;(mapa[permissao] ||= []).push(titulo)
  })
  return mapa
})

const grupos = computed(() => {
  const porArea = new Map()
  catalogo.value.permissoes.forEach((p) => {
    const area = areaDaPermissao(p.codigo)
    if (!porArea.has(area)) porArea.set(area, [])
    porArea.get(area).push({
      ...p,
      acao: acaoDaPermissao(p.codigo),
      telas: telasPorPermissao.value[p.codigo] || [],
      perfis: Object.fromEntries(catalogo.value.perfis.map((perfil) => [perfil.codigo, perfil.permissoes.includes(p.codigo)])),
    })
  })
  return [...porArea].map(([area, permissoes]) => ({ area, permissoes }))
})

const totalColunas = computed(() => catalogo.value.perfis.length + 2)

onMounted(async () => {
  try {
    catalogo.value = await buscarCatalogoAcesso()
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
      <h1 class="titulo">Matriz de Acesso</h1>
      <p class="subtitulo">
        Quem pode fazer o quê: cada permissão do sistema, os perfis que a incluem e as telas que ela libera. A mesma
        regra é conferida pelo backend em cada chamada, então esconder um botão nunca é a única proteção.
      </p>
    </header>

    <p class="aviso-leitura">
      Tela somente de consulta. Permissões e perfis são definidos no código; para dar uma permissão a alguém, use um
      perfil ou uma permissão avulsa na tela de Usuários.
    </p>

    <div v-if="erro" class="alerta-erro">✕ {{ erro }}</div>
    <p v-else-if="carregando" class="estado-vazio">Carregando matriz…</p>

    <section v-else class="card-secao">
      <div class="tabela-container">
        <table class="tabela-dados tabela-matriz">
          <thead>
            <tr>
              <th>Permissão</th>
              <th v-for="perfil in catalogo.perfis" :key="perfil.codigo" class="col-perfil" :title="perfil.descricao">
                {{ perfil.nome }}
              </th>
              <th>Telas que libera</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="grupo in grupos" :key="grupo.area">
              <tr class="linha-area">
                <td :colspan="totalColunas">{{ grupo.area }}</td>
              </tr>
              <tr v-for="permissao in grupo.permissoes" :key="permissao.codigo">
                <td>
                  <div class="permissao-acao">
                    {{ permissao.acao }}
                    <code>{{ permissao.codigo }}</code>
                  </div>
                  <div class="permissao-descricao">{{ permissao.descricao }}</div>
                </td>
                <td v-for="perfil in catalogo.perfis" :key="perfil.codigo" class="col-perfil">
                  <span
                    v-if="permissao.perfis[perfil.codigo]"
                    class="marca-sim"
                    role="img"
                    :aria-label="`${perfil.nome} tem ${permissao.codigo}`"
                  >✓</span>
                  <span v-else class="marca-nao" aria-hidden="true">—</span>
                </td>
                <td class="col-telas">
                  <span v-for="tela in permissao.telas" :key="tela" class="badge badge--perfil">{{ tela }}</span>
                  <span v-if="!permissao.telas.length" class="texto-fraco">Ações dentro das telas da área</span>
                </td>
              </tr>
            </template>
          </tbody>
          <tfoot>
            <tr>
              <td>Total de permissões</td>
              <td v-for="perfil in catalogo.perfis" :key="perfil.codigo" class="col-perfil">
                {{ perfil.permissoes.length }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped src="./controleAcesso.css"></style>

<style scoped>
.tabela-matriz thead th {
  position: sticky;
  top: 0;
  z-index: 1;
}

.col-perfil {
  text-align: center;
  width: 7.5rem;
}

.linha-area td {
  padding: 0.55rem 1rem;
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cor-primaria);
  background: var(--cor-slate-50);
}

.permissao-acao {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  color: var(--cor-slate-900);
}

.permissao-acao code {
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--cor-slate-500);
}

.permissao-descricao {
  margin-top: 0.15rem;
  font-size: 0.8rem;
  color: var(--cor-slate-500);
}

.marca-sim {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  font-weight: 800;
  background: var(--status-sucesso-bg);
  color: var(--status-sucesso-texto);
}

.marca-nao {
  color: var(--cor-slate-300);
}

.col-telas {
  min-width: 14rem;
}

tfoot td {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--cor-slate-700);
  background: var(--cor-slate-50);
  border-top: 1px solid var(--cor-slate-200);
}
</style>

<script setup>
/**
 * Administração de usuários e controle de acesso (LIZARDS-47).
 *
 * Perfis são pacotes de permissões; o usuário pode ter vários perfis e ainda permissões
 * avulsas. A tela mostra sempre as permissões EFETIVAS (perfis expandidos + avulsas), que
 * é exatamente o que o backend vai conferir.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { nomeDoPerfil, sessao } from '../auth/autenticacao'
import {
  atualizarUsuario,
  buscarCatalogoAcesso,
  buscarUsuarios,
  criarUsuario,
  definirRoles,
  redefinirSenha,
} from '../services/usuarioService'

const usuarios = ref([])
const catalogo = ref({ perfis: [], permissoes: [] })
const busca = ref('')
const carregando = ref(false)
const salvando = ref(false)
const erro = ref('')
const sucesso = ref('')
let temporizadorSucesso = null

// Modal de cadastro/edição
const modal = ref(null) // null | 'novo' | 'editar'
const erroModal = ref('')
const form = reactive({
  id: null,
  login: '',
  nome: '',
  sobrenome: '',
  email: '',
  senhaTemporaria: '',
  ativo: true,
  perfis: [],
  permissoesAvulsas: [],
})

// Modal de senha
const usuarioSenha = ref(null)
const novaSenha = ref('')

const descricaoPermissao = computed(() =>
  Object.fromEntries(catalogo.value.permissoes.map((p) => [p.codigo, p.descricao])),
)

/** Permissões que os perfis marcados no formulário já dão. */
const permissoesDosPerfis = computed(() => {
  const resultado = new Set()
  catalogo.value.perfis
    .filter((p) => form.perfis.includes(p.codigo))
    .forEach((p) => p.permissoes.forEach((codigo) => resultado.add(codigo)))
  return resultado
})

const permissoesEfetivasDoForm = computed(() =>
  catalogo.value.permissoes
    .map((p) => p.codigo)
    .filter((codigo) => permissoesDosPerfis.value.has(codigo) || form.permissoesAvulsas.includes(codigo)),
)

const ehOProprioUsuario = (usuario) => usuario.login === sessao.login

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const [lista, cat] = await Promise.all([buscarUsuarios(busca.value), buscarCatalogoAcesso()])
    usuarios.value = lista
    catalogo.value = cat
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

function mostrarSucesso(mensagem) {
  sucesso.value = mensagem
  clearTimeout(temporizadorSucesso)
  temporizadorSucesso = setTimeout(() => (sucesso.value = ''), 4000)
}

function abrirNovo() {
  Object.assign(form, {
    id: null,
    login: '',
    nome: '',
    sobrenome: '',
    email: '',
    senhaTemporaria: '',
    ativo: true,
    perfis: [],
    permissoesAvulsas: [],
  })
  erroModal.value = ''
  modal.value = 'novo'
}

function abrirEdicao(usuario) {
  Object.assign(form, {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome || '',
    sobrenome: usuario.sobrenome || '',
    email: usuario.email || '',
    senhaTemporaria: '',
    ativo: usuario.ativo,
    perfis: [...usuario.perfis],
    permissoesAvulsas: [...usuario.permissoesAvulsas],
  })
  erroModal.value = ''
  modal.value = 'editar'
}

function fecharModal() {
  modal.value = null
  usuarioSenha.value = null
}

/** Avulsa já coberta por perfil não precisa ser gravada separada. */
function rolesDoForm() {
  const avulsas = form.permissoesAvulsas.filter((p) => !permissoesDosPerfis.value.has(p))
  return [...form.perfis, ...avulsas]
}

async function salvar() {
  salvando.value = true
  erroModal.value = ''
  try {
    if (modal.value === 'novo') {
      await criarUsuario({
        login: form.login,
        nome: form.nome,
        sobrenome: form.sobrenome,
        email: form.email,
        senhaTemporaria: form.senhaTemporaria,
        roles: rolesDoForm(),
      })
      mostrarSucesso(`Usuário ${form.login} cadastrado. Ele vai trocar a senha no primeiro acesso.`)
    } else {
      await atualizarUsuario(form.id, {
        nome: form.nome,
        sobrenome: form.sobrenome,
        email: form.email,
        ativo: form.ativo,
      })
      await definirRoles(form.id, rolesDoForm())
      mostrarSucesso(`Acessos de ${form.login} atualizados.`)
    }
    fecharModal()
    await carregar()
  } catch (e) {
    erroModal.value = e.message
  } finally {
    salvando.value = false
  }
}

async function alternarAtivo(usuario) {
  const acao = usuario.ativo ? 'desativar' : 'reativar'
  if (!window.confirm(`Deseja ${acao} o usuário ${usuario.login}?`)) return
  erro.value = ''
  try {
    await atualizarUsuario(usuario.id, {
      nome: usuario.nome,
      sobrenome: usuario.sobrenome,
      email: usuario.email,
      ativo: !usuario.ativo,
    })
    mostrarSucesso(`Usuário ${usuario.login} ${usuario.ativo ? 'desativado' : 'reativado'}.`)
    await carregar()
  } catch (e) {
    erro.value = e.message
  }
}

function abrirSenha(usuario) {
  usuarioSenha.value = usuario
  novaSenha.value = ''
  erroModal.value = ''
}

async function salvarSenha() {
  salvando.value = true
  erroModal.value = ''
  try {
    await redefinirSenha(usuarioSenha.value.id, novaSenha.value)
    mostrarSucesso(`Senha temporária definida para ${usuarioSenha.value.login}.`)
    fecharModal()
  } catch (e) {
    erroModal.value = e.message
  } finally {
    salvando.value = false
  }
}

function aoPressionarTecla(evento) {
  if (evento.key === 'Escape') fecharModal()
}

onMounted(() => {
  carregar()
  window.addEventListener('keydown', aoPressionarTecla)
})

onUnmounted(() => {
  window.removeEventListener('keydown', aoPressionarTecla)
  clearTimeout(temporizadorSucesso)
})
</script>

<template>
  <div class="pagina-usuarios">
    <header class="topo-pagina">
      <div>
        <p class="etiqueta">CONTROLE DE ACESSO</p>
        <h1 class="titulo">Usuários e Acessos</h1>
        <p class="subtitulo">
          Cadastro de usuários e atribuição de perfis. Cada perfil é um pacote de permissões; permissões
          avulsas complementam o que o perfil não cobre.
        </p>
      </div>
      <div class="acoes-topo">
        <button class="btn-secundario" :disabled="carregando" @click="carregar">Atualizar</button>
        <button class="btn-primario" @click="abrirNovo">+ Novo usuário</button>
      </div>
    </header>

    <div v-if="erro" class="alerta alerta--erro">✕ {{ erro }}</div>
    <div v-if="sucesso" class="alerta alerta--sucesso">✓ {{ sucesso }}</div>

    <section class="card-secao">
      <form class="barra-busca" @submit.prevent="carregar">
        <input
          v-model="busca"
          class="campo-texto"
          type="search"
          placeholder="Buscar por login, nome ou e-mail"
          aria-label="Buscar usuário"
        />
        <button class="btn-secundario" type="submit">Buscar</button>
      </form>

      <p v-if="carregando" class="estado-vazio">Carregando usuários…</p>
      <p v-else-if="!usuarios.length" class="estado-vazio">Nenhum usuário encontrado.</p>

      <div v-else class="tabela-container">
        <table class="tabela-dados">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfis</th>
              <th>Permissões avulsas</th>
              <th>Status</th>
              <th class="col-acoes">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="usuario in usuarios" :key="usuario.id">
              <td>
                <div class="usuario-nome">{{ [usuario.nome, usuario.sobrenome].filter(Boolean).join(' ') || usuario.login }}</div>
                <div class="usuario-detalhe">{{ usuario.login }} · {{ usuario.email || 'sem e-mail' }}</div>
              </td>
              <td>
                <span v-for="perfil in usuario.perfis" :key="perfil" class="badge badge--perfil">
                  {{ nomeDoPerfil(perfil) }}
                </span>
                <span v-if="!usuario.perfis.length" class="texto-fraco">Nenhum</span>
              </td>
              <td>
                <span
                  v-for="permissao in usuario.permissoesAvulsas"
                  :key="permissao"
                  class="badge badge--permissao"
                  :title="descricaoPermissao[permissao]"
                >
                  {{ permissao }}
                </span>
                <span v-if="!usuario.permissoesAvulsas.length" class="texto-fraco">—</span>
              </td>
              <td>
                <span class="badge" :class="usuario.ativo ? 'badge--ativo' : 'badge--inativo'">
                  {{ usuario.ativo ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="col-acoes">
                <button class="btn-acao" @click="abrirEdicao(usuario)">Editar acessos</button>
                <button class="btn-acao" @click="abrirSenha(usuario)">Senha</button>
                <button
                  class="btn-acao"
                  :class="usuario.ativo ? 'btn-acao--perigo' : ''"
                  :disabled="ehOProprioUsuario(usuario)"
                  :title="ehOProprioUsuario(usuario) ? 'Você não pode desativar o seu próprio usuário' : ''"
                  @click="alternarAtivo(usuario)"
                >
                  {{ usuario.ativo ? 'Desativar' : 'Reativar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Cadastro / edição -->
    <div v-if="modal" class="modal-backdrop" @click.self="fecharModal">
      <form class="modal-dialog modal-dialog--largo" @submit.prevent="salvar">
        <header class="modal-header">
          <div>
            <span class="modal-etiqueta">{{ modal === 'novo' ? 'NOVO USUÁRIO' : 'EDITAR ACESSOS' }}</span>
            <h2 class="modal-titulo">{{ modal === 'novo' ? 'Cadastrar usuário' : form.login }}</h2>
          </div>
          <button type="button" class="btn-fechar" aria-label="Fechar" @click="fecharModal">✕</button>
        </header>

        <div class="modal-body">
          <div v-if="erroModal" class="alerta alerta--erro">✕ {{ erroModal }}</div>

          <fieldset class="grupo">
            <legend>Dados</legend>
            <div class="grade-campos">
              <label v-if="modal === 'novo'" class="campo">
                <span>Login</span>
                <input
                  v-model.trim="form.login"
                  class="campo-texto"
                  required
                  autocomplete="off"
                  pattern="[A-Za-z0-9._@\-]+"
                  title="Sem espaços nem acentos: letras, números, ponto, hífen, sublinhado ou @"
                  placeholder="ex.: maria.silva"
                />
                <small>Sem espaços nem acentos (letras, números, . _ - @).</small>
              </label>
              <label class="campo">
                <span>E-mail</span>
                <input v-model.trim="form.email" class="campo-texto" type="email" required />
              </label>
              <label class="campo">
                <span>Nome</span>
                <input v-model.trim="form.nome" class="campo-texto" required />
              </label>
              <label class="campo">
                <span>Sobrenome</span>
                <input v-model.trim="form.sobrenome" class="campo-texto" required />
              </label>
              <label v-if="modal === 'novo'" class="campo">
                <span>Senha temporária</span>
                <input
                  v-model="form.senhaTemporaria"
                  class="campo-texto"
                  type="password"
                  minlength="8"
                  required
                  autocomplete="new-password"
                />
                <small>Mínimo 8 caracteres. O usuário troca no primeiro acesso.</small>
              </label>
              <label v-else class="campo campo--checkbox">
                <input v-model="form.ativo" type="checkbox" :disabled="form.login === sessao.login" />
                <span>Usuário ativo</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="grupo">
            <legend>Perfis</legend>
            <label v-for="perfil in catalogo.perfis" :key="perfil.codigo" class="opcao">
              <input v-model="form.perfis" type="checkbox" :value="perfil.codigo" />
              <div>
                <strong>{{ perfil.nome }}</strong>
                <p class="opcao-desc">{{ perfil.descricao }}</p>
                <p class="opcao-desc">{{ perfil.permissoes.length }} permissões incluídas</p>
              </div>
            </label>
          </fieldset>

          <fieldset class="grupo">
            <legend>Permissões avulsas</legend>
            <p class="opcao-desc">Só é preciso marcar o que os perfis escolhidos não cobrem.</p>
            <label v-for="permissao in catalogo.permissoes" :key="permissao.codigo" class="opcao opcao--compacta">
              <input
                v-if="permissoesDosPerfis.has(permissao.codigo)"
                type="checkbox"
                checked
                disabled
              />
              <input v-else v-model="form.permissoesAvulsas" type="checkbox" :value="permissao.codigo" />
              <div>
                <code>{{ permissao.codigo }}</code>
                <span v-if="permissoesDosPerfis.has(permissao.codigo)" class="via-perfil">via perfil</span>
                <p class="opcao-desc">{{ permissao.descricao }}</p>
              </div>
            </label>
          </fieldset>

          <div class="resumo-efetivas">
            <strong>Permissões efetivas ({{ permissoesEfetivasDoForm.length }}):</strong>
            <span v-if="!permissoesEfetivasDoForm.length" class="texto-fraco"> nenhuma — o usuário não verá nenhuma tela.</span>
            <span v-for="codigo in permissoesEfetivasDoForm" :key="codigo" class="badge badge--permissao">{{ codigo }}</span>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn-secundario" @click="fecharModal">Cancelar</button>
          <button type="submit" class="btn-primario" :disabled="salvando">
            {{ salvando ? 'Salvando…' : 'Salvar' }}
          </button>
        </footer>
      </form>
    </div>

    <!-- Senha temporária -->
    <div v-if="usuarioSenha" class="modal-backdrop" @click.self="fecharModal">
      <form class="modal-dialog" @submit.prevent="salvarSenha">
        <header class="modal-header">
          <div>
            <span class="modal-etiqueta">REDEFINIR SENHA</span>
            <h2 class="modal-titulo">{{ usuarioSenha.login }}</h2>
          </div>
          <button type="button" class="btn-fechar" aria-label="Fechar" @click="fecharModal">✕</button>
        </header>
        <div class="modal-body">
          <div v-if="erroModal" class="alerta alerta--erro">✕ {{ erroModal }}</div>
          <label class="campo">
            <span>Nova senha temporária</span>
            <input v-model="novaSenha" class="campo-texto" type="password" minlength="8" required autocomplete="new-password" />
            <small>O usuário será obrigado a trocá-la no próximo login.</small>
          </label>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn-secundario" @click="fecharModal">Cancelar</button>
          <button type="submit" class="btn-primario" :disabled="salvando">Definir senha</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.pagina-usuarios {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.topo-pagina {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.etiqueta {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #15803d;
}

.titulo {
  font-size: 1.65rem;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.subtitulo {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 48rem;
}

.acoes-topo {
  display: flex;
  gap: 0.6rem;
}

.btn-primario,
.btn-secundario {
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
}

.btn-primario {
  background: #15803d;
  color: #ffffff;
  border: none;
}

.btn-primario:hover:not(:disabled) {
  background: #166534;
}

.btn-secundario {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-secundario:hover:not(:disabled) {
  background: #f8fafc;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.alerta {
  padding: 0.85rem 1.15rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
}

.alerta--erro {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alerta--sucesso {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.card-secao {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.barra-busca {
  display: flex;
  gap: 0.6rem;
  max-width: 32rem;
}

.campo-texto {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.86rem;
  outline: none;
  color: #1e293b;
}

.campo-texto:focus {
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
}

.estado-vazio {
  color: #64748b;
  font-size: 0.9rem;
}

.tabela-container {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
}

.tabela-dados {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  text-align: left;
}

.tabela-dados th {
  background: #f8fafc;
  padding: 0.85rem 1rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.tabela-dados td {
  padding: 0.9rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.col-acoes {
  white-space: nowrap;
  text-align: right;
}

.usuario-nome {
  font-weight: 700;
  color: #0f172a;
}

.usuario-detalhe {
  font-size: 0.78rem;
  color: #64748b;
}

.texto-fraco {
  color: #94a3b8;
  font-size: 0.8rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  margin: 0.1rem 0.25rem 0.1rem 0;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.badge--perfil {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.badge--permissao {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}

.badge--ativo {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.badge--inativo {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.btn-acao {
  margin-left: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-acao:hover:not(:disabled) {
  background: #f8fafc;
}

.btn-acao--perigo {
  color: #dc2626;
  border-color: #fecaca;
}

.btn-acao--perigo:hover:not(:disabled) {
  background: #fee2e2;
}

/* Modais */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.modal-dialog--largo {
  max-width: 760px;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fafbfc;
}

.modal-etiqueta {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #15803d;
}

.modal-titulo {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0.2rem 0 0;
}

.btn-fechar {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  background: #fafbfc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.grupo {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem 1rem 1rem;
  margin: 0;
}

.grupo legend {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 0.35rem;
}

.grade-campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.85rem;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}

.campo small {
  font-weight: 500;
  color: #94a3b8;
}

.campo--checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  align-self: end;
}

.opcao {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.55rem 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}

.opcao:last-child {
  border-bottom: none;
}

.opcao input {
  margin-top: 0.2rem;
}

.opcao--compacta {
  padding: 0.35rem 0;
}

.opcao-desc {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
}

.opcao code {
  font-size: 0.8rem;
  color: #0f172a;
}

.via-perfil {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #0369a1;
}

.resumo-efetivas {
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.9;
}

@media (max-width: 640px) {
  .acoes-topo {
    width: 100%;
  }

  .barra-busca {
    max-width: none;
  }
}
/* ==========================================================================
   Tema escuro (LIZARDS-38) — só acrescenta; o tema claro acima não muda
   ========================================================================== */
:root[data-tema="escuro"] .etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .subtitulo {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .btn-primario {
  background: var(--cor-primaria);
  color: var(--cor-primaria-contraste);
}

:root[data-tema="escuro"] .btn-primario:hover:not(:disabled) {
  background: var(--cor-primaria-hover);
}

:root[data-tema="escuro"] .btn-secundario {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-secundario:hover:not(:disabled) {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .alerta--erro {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .alerta--sucesso {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .card-secao {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .campo-texto {
  border-color: var(--cor-borda-forte);
  color: var(--cor-texto);
}

:root[data-tema="escuro"] .campo-texto:focus {
  border-color: var(--cor-primaria);
  box-shadow: none;
}

:root[data-tema="escuro"] .estado-vazio {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .tabela-container {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-dados th {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-rotulo);
  border-bottom-color: var(--cor-borda);
}

:root[data-tema="escuro"] .tabela-dados td {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .usuario-nome {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .usuario-detalhe {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .texto-fraco {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .badge--perfil {
  background: var(--tenue-info);
  color: var(--cor-info);
  border-color: rgb(124 180 247 / 30%);
}

:root[data-tema="escuro"] .badge--permissao {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .badge--ativo {
  background: var(--cor-primaria-tenue);
  color: var(--cor-sucesso);
  border-color: var(--cor-primaria-borda);
}

:root[data-tema="escuro"] .badge--inativo {
  background: var(--tenue-erro);
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .btn-acao {
  background: var(--cor-superficie-elevada);
  color: var(--cor-texto-secundario);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-acao:hover:not(:disabled) {
  background: var(--cor-borda);
}

:root[data-tema="escuro"] .btn-acao--perigo {
  color: var(--cor-erro);
  border-color: rgb(248 113 113 / 30%);
}

:root[data-tema="escuro"] .btn-acao--perigo:hover:not(:disabled) {
  background: var(--tenue-erro);
}

:root[data-tema="escuro"] .modal-dialog {
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .modal-header {
  border-bottom-color: var(--cor-borda-suave);
  background: var(--cor-superficie-elevada);
}

:root[data-tema="escuro"] .modal-etiqueta {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .modal-titulo {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .btn-fechar {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .modal-footer {
  background: var(--cor-superficie-elevada);
  border-top-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .grupo {
  border-color: var(--cor-borda);
}

:root[data-tema="escuro"] .grupo legend {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo {
  color: var(--cor-texto-secundario);
}

:root[data-tema="escuro"] .campo small {
  color: var(--cor-texto-rotulo);
}

:root[data-tema="escuro"] .opcao {
  border-bottom-color: var(--cor-borda-suave);
}

:root[data-tema="escuro"] .opcao-desc {
  color: var(--cor-texto-terciario);
}

:root[data-tema="escuro"] .opcao code {
  color: var(--cor-texto-titulo);
}

:root[data-tema="escuro"] .via-perfil {
  color: var(--cor-info);
}

:root[data-tema="escuro"] .resumo-efetivas {
  color: var(--cor-texto-secundario);
}
</style>

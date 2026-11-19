<script setup>
/**
 * Minha conta: abre pelo nome no rodapé do menu. O próprio usuário troca o nome e a senha;
 * login, e-mail, perfis e situação só o administrador muda (tela de Usuários).
 *
 * Token de acesso: só o perfil Administrador tem (e só ele vê o cartão); quem libera é o
 * administrador. Aqui aparece só o estado, porque a criação do token (buscar dados da Gold
 * pela API) ainda vai ser entregue.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { nomeDoPerfil, sessao } from '../auth/autenticacao'
import { buscarMinhaConta, salvarNome, trocarSenha } from '../services/minhaContaService'
import Interruptor from './Interruptor.vue'

const conta = ref(null)
const carregando = ref(true)
const erro = ref('')

const dados = reactive({ nome: '', sobrenome: '' })
const salvandoNome = ref(false)
const erroNome = ref('')
const sucessoNome = ref('')

const senha = reactive({ atual: '', nova: '', confirmacao: '' })
const salvandoSenha = ref(false)
const erroSenha = ref('')
const sucessoSenha = ref('')

const temporizadores = []
function mostrar(alvo, mensagem) {
  alvo.value = mensagem
  temporizadores.push(setTimeout(() => (alvo.value = ''), 4000))
}
onUnmounted(() => temporizadores.forEach(clearTimeout))

const nomeMudou = computed(
  () => conta.value && (dados.nome.trim() !== (conta.value.nome || '') || dados.sobrenome.trim() !== (conta.value.sobrenome || '')),
)

// Token de acesso: só o perfil Administrador pode ter, então só ele vê o cartão
const ehAdministrador = computed(() => Boolean(conta.value?.perfis?.includes('perfil-administrador')))

const senhasDiferentes = computed(() => senha.confirmacao !== '' && senha.nova !== senha.confirmacao)

const criadoEm = computed(() =>
  conta.value?.criadoEm ? new Date(conta.value.criadoEm).toLocaleDateString('pt-BR') : '—',
)

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    conta.value = await buscarMinhaConta()
    dados.nome = conta.value.nome || ''
    dados.sobrenome = conta.value.sobrenome || ''
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

async function salvarDados() {
  erroNome.value = ''
  if (!nomeMudou.value) return
  salvandoNome.value = true
  try {
    conta.value = await salvarNome(dados.nome.trim(), dados.sobrenome.trim())
    dados.nome = conta.value.nome || ''
    dados.sobrenome = conta.value.sobrenome || ''
    // O token só traz o nome novo no próximo login; o rodapé do menu já mostra agora
    sessao.nome = [conta.value.nome, conta.value.sobrenome].filter(Boolean).join(' ') || sessao.login
    mostrar(sucessoNome, 'Nome atualizado.')
  } catch (e) {
    erroNome.value = e.message
  } finally {
    salvandoNome.value = false
  }
}

async function salvarSenha() {
  erroSenha.value = ''
  if (senha.nova.length < 8) {
    erroSenha.value = 'A nova senha precisa ter pelo menos 8 caracteres.'
    return
  }
  if (senha.nova !== senha.confirmacao) {
    erroSenha.value = 'A confirmação não é igual à nova senha.'
    return
  }
  salvandoSenha.value = true
  try {
    await trocarSenha(senha.atual, senha.nova)
    Object.assign(senha, { atual: '', nova: '', confirmacao: '' })
    mostrar(sucessoSenha, 'Senha trocada. Use a nova senha no próximo login.')
  } catch (e) {
    erroSenha.value = e.message
  } finally {
    salvandoSenha.value = false
  }
}

onMounted(carregar)
</script>

<template>
  <div class="pagina-acesso">
    <header>
      <p class="etiqueta">MINHA CONTA</p>
      <h1 class="titulo">Meus dados</h1>
      <p class="subtitulo">
        Você pode trocar o seu nome e a sua senha. Login, e-mail, perfis e situação são alterados
        pelo administrador.
      </p>
    </header>

    <div v-if="erro" class="alerta-erro">✕ {{ erro }}</div>
    <p v-else-if="carregando" class="estado-vazio">Carregando…</p>

    <template v-else-if="conta">
      <!-- Dados -->
      <form class="card-secao" aria-label="Dados da conta" @submit.prevent="salvarDados">
        <h2 class="titulo-card">Dados</h2>
        <div v-if="erroNome" class="alerta-erro">✕ {{ erroNome }}</div>
        <div v-if="sucessoNome" class="alerta-sucesso" role="status">✓ {{ sucessoNome }}</div>

        <div class="grade-campos">
          <label class="campo">
            <span class="rotulo">Nome</span>
            <input v-model="dados.nome" class="campo-texto" required autocomplete="given-name" />
          </label>
          <label class="campo">
            <span class="rotulo">Sobrenome</span>
            <input v-model="dados.sobrenome" class="campo-texto" required autocomplete="family-name" />
          </label>
          <div class="campo">
            <span class="rotulo">Login</span>
            <span class="valor-fixo" data-campo="login">{{ conta.login }}</span>
          </div>
          <div class="campo">
            <span class="rotulo">E-mail</span>
            <span class="valor-fixo" data-campo="email">{{ conta.email || '—' }}</span>
          </div>
          <div class="campo">
            <span class="rotulo">Perfis</span>
            <span class="valor-fixo" data-campo="perfis">
              {{ conta.perfis.length ? conta.perfis.map(nomeDoPerfil).join(', ') : 'Nenhum' }}
            </span>
          </div>
          <div class="campo">
            <span class="rotulo">Situação</span>
            <span class="valor-fixo" data-campo="situacao">
              {{ conta.ativo ? 'Ativo' : 'Inativo' }} · desde {{ criadoEm }}
            </span>
          </div>
        </div>

        <div class="acoes">
          <button type="submit" class="btn-primario" :disabled="salvandoNome || !nomeMudou">
            {{ salvandoNome ? 'Salvando…' : 'Salvar nome' }}
          </button>
        </div>
      </form>

      <!-- Senha -->
      <form class="card-secao" aria-label="Trocar senha" @submit.prevent="salvarSenha">
        <h2 class="titulo-card">Senha</h2>
        <div v-if="erroSenha" class="alerta-erro">✕ {{ erroSenha }}</div>
        <div v-if="sucessoSenha" class="alerta-sucesso" role="status">✓ {{ sucessoSenha }}</div>

        <div class="grade-campos">
          <label class="campo">
            <span class="rotulo">Senha atual</span>
            <input v-model="senha.atual" class="campo-texto" type="password" required autocomplete="current-password" />
          </label>
          <span class="campo campo--vazio" aria-hidden="true"></span>
          <label class="campo">
            <span class="rotulo">Nova senha</span>
            <input
              v-model="senha.nova"
              class="campo-texto"
              type="password"
              minlength="8"
              required
              autocomplete="new-password"
            />
            <small>Mínimo 8 caracteres.</small>
          </label>
          <label class="campo">
            <span class="rotulo">Confirmar nova senha</span>
            <input
              v-model="senha.confirmacao"
              class="campo-texto"
              type="password"
              required
              autocomplete="new-password"
            />
            <small v-if="senhasDiferentes" class="texto-erro">A confirmação não é igual à nova senha.</small>
          </label>
        </div>

        <div class="acoes">
          <button
            type="submit"
            class="btn-primario"
            :disabled="salvandoSenha || !senha.atual || !senha.nova || !senha.confirmacao"
          >
            {{ salvandoSenha ? 'Trocando…' : 'Trocar senha' }}
          </button>
        </div>
      </form>

      <!-- Token de acesso -->
      <section v-if="ehAdministrador" class="card-secao" aria-label="Token de acesso">
        <div class="cabecalho-token">
          <h2 class="titulo-card">Token de acesso</h2>
          <span class="selo-em-breve">Disponível em breve</span>
        </div>
        <div class="linha-token">
          <Interruptor
            :model-value="conta.tokenAcessoHabilitado"
            rotulo="Criação de token de acesso"
            somente-leitura
          />
          <span class="texto-token">
            {{ conta.tokenAcessoHabilitado ? 'Liberado pelo administrador' : 'Não liberado' }}
          </span>
        </div>
        <p class="ajuda">
          O token vai permitir buscar os dados da Gold direto pela API, sem passar pelas telas. Só
          o perfil Administrador tem token, sem senha própria (vale o login), e quem libera é o
          administrador, na tela de Usuários.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped src="../styles/views/MinhaContaView.css"></style>

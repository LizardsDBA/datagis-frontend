import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { iniciarAutenticacao } from './auth/autenticacao'

// Só monta o app com o usuário logado: sem sessão, o Keycloak redireciona pra tela de
// login e volta pra cá. As permissões do token já estão prontas quando o router decide
// a primeira tela.
iniciarAutenticacao()
  .then(() => createApp(App).use(router).mount('#app'))
  .catch((erro) => {
    console.error('Falha ao iniciar o login', erro)
    document.getElementById('app').innerHTML =
      '<p style="font-family: sans-serif; padding: 2rem; color: #991b1b">' +
      'Não foi possível conectar ao serviço de login (Keycloak). ' +
      'Confira se o container <strong>keycloak</strong> está no ar e recarregue a página.</p>'
  })

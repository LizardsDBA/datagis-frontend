/**
 * Tema claro/escuro (LIZARDS-38).
 *
 * O tema vive no atributo `data-tema` do <html>; as cores do escuro estão em
 * `:root[data-tema="escuro"]` no style.css. Ao abrir, vale a escolha salva pelo usuário;
 * sem escolha salva, segue a preferência do sistema operacional.
 *
 * A escolha fica no localStorage do navegador. Se ele não estiver disponível (aba anônima,
 * bloqueio do navegador), o tema funciona igual, só não é lembrado ao recarregar.
 */
import { reactive } from 'vue'

const CHAVE = 'datagis.tema'
const TEMAS = ['claro', 'escuro']

export const estadoTema = reactive({ atual: 'claro' })

function lerEscolhaSalva() {
  try {
    const salvo = localStorage.getItem(CHAVE)
    return TEMAS.includes(salvo) ? salvo : null
  } catch {
    return null
  }
}

function preferenciaDoSistema() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

function aplicar(tema) {
  estadoTema.atual = tema
  document.documentElement.dataset.tema = tema
}

/** Chamado no main.js antes de montar o app, para a tela não piscar no tema errado. */
export function iniciarTema() {
  aplicar(lerEscolhaSalva() ?? preferenciaDoSistema())
}

export function alternarTema() {
  const novo = estadoTema.atual === 'escuro' ? 'claro' : 'escuro'
  aplicar(novo)
  try {
    localStorage.setItem(CHAVE, novo)
  } catch {
    // Sem localStorage a escolha só não sobrevive ao recarregar a página
  }
}

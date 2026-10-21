import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// O jsdom não aplica as folhas de estilo, então estes testes leem o CSS como texto:
// não provam que a tela ficou escura, mas travam os erros que já aconteceram ou que
// quebrariam o tema sem nenhum aviso (token apagado, nome digitado errado, :global).

// Sem new URL(): no ambiente jsdom o URL global é o do navegador simulado
const pastaSrc = dirname(fileURLToPath(import.meta.url))
const pastaComponentes = join(pastaSrc, 'components')
const estiloGlobal = readFileSync(join(pastaSrc, 'style.css'), 'utf8')

const componentes = readdirSync(pastaComponentes)
  .filter((arquivo) => arquivo.endsWith('.vue'))
  .map((arquivo) => ({ arquivo, fonte: readFileSync(join(pastaComponentes, arquivo), 'utf8') }))

const comTemaEscuro = componentes.filter(({ fonte }) => fonte.includes('data-tema="escuro"'))

// Paleta aprovada para a LIZARDS-38 — os valores exatos do bloco escuro do style.css
const PALETA = {
  '--cor-fundo': '#0E1319',
  '--cor-superficie': '#151C24',
  '--cor-superficie-elevada': '#1C2530',
  '--cor-borda-suave': '#1E2834',
  '--cor-borda': '#263241',
  '--cor-borda-forte': '#2C3A4A',
  '--cor-texto-titulo': '#F3F7FA',
  '--cor-texto': '#E6EDF3',
  '--cor-texto-secundario': '#C7D4DF',
  '--cor-texto-terciario': '#9FB0C0',
  '--cor-texto-rotulo': '#8396A6',
  '--cor-texto-desabilitado': '#6F8293',
  '--cor-primaria': '#3BAE74',
  '--cor-primaria-hover': '#46C184',
  '--cor-primaria-contraste': '#06140D',
  '--cor-primaria-tenue': 'rgb(59 174 116 / 14%)',
  '--cor-primaria-borda': 'rgb(59 174 116 / 34%)',
  '--cor-link': '#8DD5AE',
  '--cor-sucesso': '#4ADE80',
  '--cor-alerta': '#FBBF24',
  '--cor-erro': '#F87171',
  '--cor-info': '#7CB4F7',
  '--cor-destaque': '#B49CFB',
  '--tenue-sucesso': 'rgb(74 222 128 / 12%)',
  '--tenue-alerta': 'rgb(251 191 36 / 12%)',
  '--tenue-erro': 'rgb(248 113 113 / 12%)',
  '--tenue-info': 'rgb(124 180 247 / 12%)',
  '--tenue-destaque': 'rgb(180 156 251 / 12%)',
}

function primeiroBloco(css, seletor) {
  const inicio = css.indexOf(`${seletor} {`)
  return inicio < 0 ? '' : css.slice(inicio, css.indexOf('}', inicio))
}

describe('Tema escuro — paleta no style.css', () => {
  const blocoPaleta = primeiroBloco(estiloGlobal, ':root[data-tema="escuro"]')

  it.each(Object.entries(PALETA))('%s vale %s', (token, valor) => {
    const declaracao = blocoPaleta.match(new RegExp(`${token}:\\s*([^;]+);`))

    expect(declaracao, `${token} sumiu do bloco escuro`).not.toBeNull()
    expect(declaracao[1].trim().toLowerCase()).toBe(valor.toLowerCase())
  })

  it('o tema claro continua sendo o :root padrão', () => {
    expect(estiloGlobal).toMatch(/^:root \{/m)
    expect(primeiroBloco(estiloGlobal, ':root')).toContain('--cor-branco: #ffffff')
  })
})

describe('Tema escuro — CSS dos componentes', () => {
  it('existe tema escuro nas telas', () => {
    expect(comTemaEscuro.length).toBeGreaterThan(10)
  })

  // No <style scoped>, :global(:root[...]) .classe faz o Vue descartar o .classe e a
  // regra vira só :root — pintando a página inteira (aconteceu no commit da sidebar).
  it.each(comTemaEscuro.map(({ arquivo }) => arquivo))('%s não usa :global(:root', (arquivo) => {
    const { fonte } = comTemaEscuro.find((c) => c.arquivo === arquivo)

    expect(fonte).not.toMatch(/:global\(\s*:root/)
  })

  // Num componente, o prefixo precisa vir seguido de uma classe; sozinho ele mudaria o
  // documento inteiro, e isso só pode existir no style.css.
  it.each(comTemaEscuro.map(({ arquivo }) => arquivo))('%s não tem :root[data-tema] solto', (arquivo) => {
    const { fonte } = comTemaEscuro.find((c) => c.arquivo === arquivo)

    expect(fonte).not.toMatch(/:root\[data-tema="escuro"\]\s*[{,]/)
  })

  // Variável com nome errado (var(--cor-texo)) não dá erro nenhum: a cor simplesmente
  // não aparece. Todo var(--x) usado no tema escuro precisa estar definido no style.css.
  it('toda variável usada no tema escuro existe no style.css', () => {
    const definidas = new Set([...estiloGlobal.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const faltando = []

    for (const { arquivo, fonte } of comTemaEscuro) {
      const trechoEscuro = fonte.slice(fonte.indexOf('data-tema="escuro"'))
      for (const [, nome] of trechoEscuro.matchAll(/var\((--[\w-]+)/g)) {
        if (!definidas.has(nome)) faltando.push(`${arquivo}: ${nome}`)
      }
    }

    expect(faltando).toEqual([])
  })
})

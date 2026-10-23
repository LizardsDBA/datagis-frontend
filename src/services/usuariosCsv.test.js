import { describe, expect, it } from 'vitest'
import {
  formatarDataHora,
  gerarCsvExportacao,
  gerarCsvModelo,
  interpretarImportacao,
  lerCsv,
  nomeArquivoExportacao,
} from './usuariosCsv'

const CATALOGO = {
  perfis: [
    { codigo: 'perfil-analista', nome: 'Analista', descricao: '', permissoes: ['fonte:visualizar'] },
    { codigo: 'perfil-auditor', nome: 'Auditor', descricao: '', permissoes: ['auditoria:visualizar'] },
  ],
  permissoes: [
    { codigo: 'fonte:visualizar', descricao: '' },
    { codigo: 'lote:gerenciar', descricao: '' },
    { codigo: 'auditoria:visualizar', descricao: '' },
  ],
}

const CABECALHO = 'login;nome;sobrenome;email;senha_temporaria;perfis;permissoes_avulsas'

describe('usuariosCsv', () => {
  it('exporta com BOM, separador vírgula e aspas na célula que tem vírgula', () => {
    const csv = gerarCsvExportacao(
      [
        {
          login: 'maria',
          nome: 'Maria',
          sobrenome: 'Silva',
          email: 'maria@x.com',
          ativo: true,
          perfis: ['perfil-analista'],
          permissoesAvulsas: ['lote:gerenciar'],
          permissoesEfetivas: ['fonte:visualizar', 'lote:gerenciar'],
          criadoEm: '2026-10-17T11:27:50',
        },
      ],
      (c) => c.replace('perfil-', ''),
    )

    expect(csv.startsWith('\uFEFF')).toBe(true)
    const [cabecalho, linha] = csv.slice(1).trim().split('\r\n')
    expect(cabecalho).toBe(
      'login,nome,sobrenome,email,perfis,permissoes_avulsas,permissoes_efetivas,criado_em,ativo',
    )
    expect(linha).toBe(
      'maria,Maria,Silva,maria@x.com,analista,lote:gerenciar,"fonte:visualizar, lote:gerenciar",17/10/2026 11:27,Sim',
    )
    // lido de volta, cada valor cai na sua coluna (o problema do Excel juntando tudo)
    expect(lerCsv(csv)[1]).toHaveLength(9)
  })

  it('nome do arquivo é userDatagis com a data', () => {
    expect(nomeArquivoExportacao('csv', new Date(2026, 9, 23))).toBe('userDatagis_23-10-2026.csv')
    expect(nomeArquivoExportacao('pdf', new Date(2026, 0, 5))).toBe('userDatagis_05-01-2026.pdf')
  })

  it('data e hora sem vírgula no meio', () => {
    expect(formatarDataHora('2026-10-17T09:05:00')).toBe('17/10/2026 09:05')
    expect(formatarDataHora(null)).toBe('')
  })

  it('não deixa um valor virar fórmula no Excel', () => {
    const csv = gerarCsvExportacao([{ login: '=CMD()', perfis: [], permissoesAvulsas: [] }])
    expect(csv).toContain("'=CMD()")
  })

  it('o modelo tem o cabeçalho de importação e uma linha de exemplo', () => {
    const [cabecalho, exemplo] = lerCsv(gerarCsvModelo())
    expect(cabecalho.join(';')).toBe(CABECALHO)
    expect(gerarCsvModelo()).toContain('login,nome,sobrenome')
    expect(exemplo[0]).toBe('maria.silva')
  })

  it('lê aspas, separador dentro do campo e linhas em branco', () => {
    expect(lerCsv('a;b\r\n"x;1";"diz ""oi"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'diz "oi"'],
    ])
  })

  it('aceita planilha salva com vírgula', () => {
    const { linhas } = interpretarImportacao(
      'login,nome,sobrenome,email,senha_temporaria\njoao,João,Souza,joao@x.com,Senha@123',
      CATALOGO,
    )
    expect(linhas[0].erros).toEqual([])
    expect(linhas[0].payload.login).toBe('joao')
  })

  it('monta os roles: perfil pelo nome, sem acento e sem repetir avulsa que o perfil já cobre', () => {
    const { linhas } = interpretarImportacao(
      `${CABECALHO}\njoao;João;Souza;joao@x.com;Senha@123;analista, AUDITOR;fonte:visualizar, lote:gerenciar`,
      CATALOGO,
    )
    expect(linhas[0].erros).toEqual([])
    expect(linhas[0].perfis).toEqual(['Analista', 'Auditor'])
    expect(linhas[0].payload.roles).toEqual(['perfil-analista', 'perfil-auditor', 'lote:gerenciar'])
  })

  it('aponta cada erro na linha certa da planilha', () => {
    const { linhas } = interpretarImportacao(
      [
        CABECALHO,
        'ok;A;B;a@x.com;Senha@123;;',
        'joão silva;A;B;sem-arroba;123;Gerente;voar:alto',
        'admin;A;B;c@x.com;Senha@123;;',
        'OK;A;B;d@x.com;Senha@123;;',
        ';A;B;e@x.com;Senha@123;;',
      ].join('\n'),
      CATALOGO,
      ['admin'],
    )

    expect(linhas.map((l) => l.linha)).toEqual([2, 3, 4, 5, 6])
    expect(linhas[0].erros).toEqual([])
    expect(linhas[1].erros).toEqual([
      'login com espaço ou acento',
      'e-mail inválido',
      'senha com menos de 8 caracteres',
      'perfil desconhecido: Gerente',
      'permissão desconhecida: voar:alto',
    ])
    expect(linhas[2].erros).toEqual(['login já cadastrado'])
    expect(linhas[3].erros).toEqual(['login repetido no arquivo'])
    expect(linhas[4].erros).toEqual(['login em branco'])
  })

  it('recusa arquivo sem as colunas obrigatórias ou sem usuários', () => {
    expect(interpretarImportacao('login;nome\nx;y', CATALOGO).erroArquivo).toContain(
      'sobrenome, email, senha_temporaria',
    )
    expect(interpretarImportacao(CABECALHO, CATALOGO).erroArquivo).toContain('nenhum usuário')
    expect(interpretarImportacao('', CATALOGO).erroArquivo).toBe('O arquivo está vazio.')
  })
})

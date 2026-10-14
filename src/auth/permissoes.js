/**
 * Códigos das roles de permissão — os MESMOS do backend (enum Permissao.java). É só
 * isso que rota, menu e botão conferem; perfil nunca entra em regra de acesso.
 */
export const PERMISSOES = Object.freeze({
  FONTE_VISUALIZAR: 'fonte:visualizar',
  FONTE_GERENCIAR: 'fonte:gerenciar',
  LOTE_VISUALIZAR: 'lote:visualizar',
  LOTE_GERENCIAR: 'lote:gerenciar',
  QUARENTENA_VISUALIZAR: 'quarentena:visualizar',
  QUARENTENA_TRATAR: 'quarentena:tratar',
  DADOS_VISUALIZAR: 'dados:visualizar',
  CONJUNTO_VISUALIZAR: 'conjunto:visualizar',
  CONJUNTO_GERENCIAR: 'conjunto:gerenciar',
  INDICADOR_VISUALIZAR: 'indicador:visualizar',
  INDICADOR_PUBLICAR: 'indicador:publicar',
  AUDITORIA_VISUALIZAR: 'auditoria:visualizar',
  USUARIO_GERENCIAR: 'usuario:gerenciar',
})

/** Textos das telas do Controle de Acesso: a área e a ação de cada permissão. */

const AREAS = {
  fonte: 'Fontes de dados',
  lote: 'Lotes e pipeline',
  quarentena: 'Quarentena',
  dados: 'Conjunto de dados',
  conjunto: 'Indicadores e cobertura',
  indicador: 'Indicadores (Gold)',
  auditoria: 'Auditoria',
  usuario: 'Usuários e acessos',
}

/** "lote:gerenciar" -> "Lotes e pipeline" */
export function areaDaPermissao(codigo) {
  const prefixo = String(codigo).split(':')[0]
  return AREAS[prefixo] || prefixo
}

/** "lote:gerenciar" -> "Gerenciar" */
export function acaoDaPermissao(codigo) {
  const acao = String(codigo).split(':')[1] || ''
  return acao.charAt(0).toUpperCase() + acao.slice(1)
}

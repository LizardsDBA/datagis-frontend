/**
 * Serviço de comunicação com os endpoints da Quarentena do DataGIS.
 */

import { apiFetch } from './http'

export async function buscarItensQuarentena(params = {}) {
  const query = new URLSearchParams()
  if (params.entidade && params.entidade !== 'todas' && params.entidade !== 'todos') query.set('entidade', params.entidade)
  if (params.status && params.status !== 'todos' && params.status !== 'todas') query.set('status', params.status)
  if (params.tipoErro && params.tipoErro !== 'todos' && params.tipoErro !== 'todas') query.set('tipoErro', params.tipoErro)
  if (params.fonteDadoId) query.set('fonteDadoId', params.fonteDadoId)
  if (params.loteIngestaoId) query.set('loteIngestaoId', params.loteIngestaoId)
  if (params.pagina !== undefined) query.set('pagina', params.pagina)
  if (params.tamanho !== undefined) query.set('tamanho', params.tamanho)

  const resp = await apiFetch(`/api/quarentena?${query.toString()}`)
  if (!resp.ok) {
    const corpoErro = await resp.json().catch(() => null)
    throw new Error(corpoErro?.erro || `Falha ao carregar itens da quarentena: ${resp.statusText}`)
  }
  const totalHeader = resp.headers.get('X-Total-Count')
  const dados = await resp.json()
  return {
    itens: dados,
    totalCount: totalHeader ? parseInt(totalHeader, 10) : dados.length,
  }
}

export async function buscarMetricasQuarentena() {
  const resp = await apiFetch('/api/quarentena/metricas')
  if (!resp.ok) throw new Error('Falha ao carregar métricas da quarentena')
  return resp.json()
}

export async function buscarTiposErro() {
  const resp = await apiFetch('/api/quarentena/tipos-erro')
  if (!resp.ok) throw new Error('Falha ao carregar tipos de erro')
  return resp.json()
}

export async function buscarStatusAnalise() {
  const resp = await apiFetch('/api/quarentena/status-analise')
  if (!resp.ok) throw new Error('Falha ao carregar status de análise')
  return resp.json()
}

export async function buscarDetalheItem(entidade, id) {
  const resp = await apiFetch(`/api/quarentena/${encodeURIComponent(entidade)}/${id}`)
  if (!resp.ok) throw new Error('Falha ao carregar detalhe do item')
  return resp.json()
}

export async function descartarItem(entidade, id, motivo, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/${encodeURIComponent(entidade)}/${id}/descartar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo, analistaId }),
  })
  if (!resp.ok) throw new Error('Falha ao descartar item')
  return true
}

export async function iniciarAnaliseItem(entidade, id, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/${encodeURIComponent(entidade)}/${id}/iniciar-analise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analistaId }),
  })
  if (!resp.ok) throw new Error('Falha ao iniciar análise')
  return true
}

export async function reprocessarItem(entidade, id, payloadCorrigido, analistaId = 1, geometriaCorrigida = null) {
  const resp = await apiFetch(`/api/quarentena/${encodeURIComponent(entidade)}/${id}/reprocessar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payloadCorrigido, analistaId, geometriaCorrigida }),
  })
  if (!resp.ok) {
    const corpoErro = await resp.json().catch(() => null)
    throw new Error(corpoErro?.erro || corpoErro?.message || `Falha ao reprocessar item: ${resp.statusText}`)
  }
  return await resp.json().catch(() => ({ sucesso: true }))
}

export async function liberarLote(loteId, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/lotes/${loteId}/liberar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analistaId }),
  })
  if (!resp.ok) {
    const corpoErro = await resp.json().catch(() => null)
    throw new Error(corpoErro?.erro || corpoErro?.message || `Falha ao liberar lote para a Silver: ${resp.statusText}`)
  }
  return true
}

export async function descartarLote(loteId, motivo, analistaId = 1) {
  const resp = await apiFetch(`/api/quarentena/lotes/${loteId}/descartar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo, analistaId }),
  })
  if (!resp.ok) throw new Error('Falha ao descartar lote')
  return true
}

export async function buscarMapeamentos(fonteId) {
  const resp = await apiFetch(`/api/fontes/${fonteId}/mapeamentos`)
  if (!resp.ok) throw new Error('Falha ao carregar mapeamentos da fonte')
  return resp.json()
}

export async function salvarMapeamentos(fonteId, mapeamentos) {
  const resp = await apiFetch(`/api/fontes/${fonteId}/mapeamentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapeamentos),
  })
  if (!resp.ok) throw new Error('Falha ao salvar mapeamentos')
  return resp.json()
}

export async function excluirMapeamento(fonteId, id) {
  const resp = await apiFetch(`/api/fontes/${fonteId}/mapeamentos/${id}`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error('Falha ao excluir mapeamento')
  return true
}

export async function limparTodosMapeamentosFonte(fonteId) {
  const resp = await apiFetch(`/api/fontes/${fonteId}/mapeamentos`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error('Falha ao limpar mapeamentos da fonte')
  return true
}

export async function buscarEsquemasSilver() {
  const resp = await apiFetch('/api/fontes/esquemas-silver')
  if (!resp.ok) throw new Error('Falha ao carregar catálogo de esquemas Silver')
  return resp.json()
}

export async function atualizarEntidadeSilverFonte(fonteId, entidadeSilver) {
  const resp = await apiFetch(`/api/fontes/${fonteId}/entidade-silver`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entidadeSilver }),
  })
  if (!resp.ok) {
    const corpoErro = await resp.json().catch(() => null)
    throw new Error(corpoErro?.erro || corpoErro?.message || 'Falha ao vincular tabela Silver à fonte')
  }
  return resp.json()
}

export async function buscarDiagnostico(params = {}) {
  const query = new URLSearchParams()
  if (params.loteIngestaoId) query.set('loteIngestaoId', params.loteIngestaoId)
  if (params.dataInicio) query.set('dataInicio', params.dataInicio)
  if (params.dataFim) query.set('dataFim', params.dataFim)

  const resp = await apiFetch(`/api/quarentena/diagnostico?${query.toString()}`)
  if (!resp.ok) throw new Error(`Falha ao carregar diagnóstico da quarentena: ${resp.statusText}`)
  return resp.json()
}

export async function adicionarValorDominio(dados) {
  const resp = await apiFetch('/api/quarentena/dominios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  if (!resp.ok) {
    const corpoErro = await resp.json().catch(() => null)
    throw new Error(corpoErro?.erro || corpoErro?.message || 'Falha ao adicionar valor ao domínio')
  }
  return resp.json()
}

export async function buscarTiposAreaProtegida() {
  const resp = await apiFetch('/api/quarentena/dominios/tipos-area-protegida')
  if (!resp.ok) throw new Error('Falha ao listar tipos de áreas protegidas')
  return resp.json()
}

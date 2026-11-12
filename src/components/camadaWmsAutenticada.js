/**
 * Camada WMS do mapa de cobertura (LIZARDS-35), com o token do Keycloak.
 *
 * Uma imagem só por camada, do tamanho do mapa (com uma folga em volta), pedida de novo
 * quando o mapa para de mexer — e não a grade de tiles de 256 px do L.tileLayer.wms.
 * Com o Paraná inteiro na tela eram ~20 tiles por camada (~120 pedidos com todas
 * ligadas), cada um passando pelo proxy do backend e o GeoServer lendo de novo do Oracle
 * as feições que cruzam a borda de cada tile; e o zoom fracionado (zoomSnap 0.25)
 * deixava emendas claras entre os tiles. Uma imagem = 1 pedido por camada, sem emenda.
 *
 * O <img> não manda cabeçalho Authorization, e o proxy do backend recusaria: a imagem é
 * baixada pelo apiFetch e entra como blob. Resposta que não é imagem (o GeoServer devolve
 * erro como XML com HTTP 200) vira erro da camada.
 *
 * As imagens já baixadas ficam num cache curto em memória (mesma URL, mesma imagem):
 * ligar e desligar uma camada, ou voltar ao Paraná inteiro, não pede de novo ao GeoServer.
 *
 * Eventos, como os de uma camada de tiles: 'loading' ao pedir, 'load' quando a imagem
 * nova está na tela (ou o pedido falhou, para o aviso de carregamento não ficar preso) e
 * 'tileerror' com { error } na falha.
 */
import L from 'leaflet'
import { apiFetch } from '../services/http'

/** Painel das imagens: acima do fundo (150) e dos tiles (200), abaixo da máscara (350). */
export const PAINEL_WMS = 'camadasWms'
const Z_PAINEL_WMS = 250

/** Folga em volta do mapa, em fração do tamanho dele: arrastar um pouco não mostra borda vazia. */
const FOLGA = 0.25

/** Opções da camada no Leaflet; o resto vira parâmetro do GetMap. */
const OPCOES_LEAFLET = ['pane', 'zIndex', 'opacity', 'className']

const LIMITE_CACHE = 40
const cache = new Map() // url -> blob URL, do mais antigo pro mais recente

function lerDoCache(url) {
  const objeto = cache.get(url)
  if (objeto) {
    cache.delete(url)
    cache.set(url, objeto)
  }
  return objeto
}

function guardarNoCache(url, objeto) {
  cache.set(url, objeto)
  while (cache.size > LIMITE_CACHE) {
    const [maisAntiga, blob] = cache.entries().next().value
    cache.delete(maisAntiga)
    URL.revokeObjectURL(blob)
  }
}

/** Só para os testes: esvazia o cache entre um caso e outro. */
export function limparCacheWms() {
  cache.forEach((blob) => URL.revokeObjectURL(blob))
  cache.clear()
}

async function baixarImagem(url, signal) {
  const resposta = await apiFetch(url, { signal })
  const tipo = resposta.headers.get('content-type') || ''
  if (!resposta.ok || !tipo.startsWith('image/')) {
    throw new Error(`Imagem recusada: HTTP ${resposta.status} ${tipo}`)
  }
  const objeto = URL.createObjectURL(await resposta.blob())
  guardarNoCache(url, objeto)
  return objeto
}

export const CamadaWmsAutenticada = L.Layer.extend({
  options: {
    pane: PAINEL_WMS,
    zIndex: 1,
    opacity: 1,
  },

  initialize(url, opcoes = {}) {
    this._url = url
    const leaflet = {}
    const wms = {}
    Object.entries(opcoes).forEach(([chave, valor]) => {
      if (OPCOES_LEAFLET.includes(chave)) leaflet[chave] = valor
      else wms[chave] = valor
    })
    L.setOptions(this, leaflet)
    this.wmsParams = {
      service: 'WMS',
      request: 'GetMap',
      version: '1.1.1',
      styles: '',
      format: 'image/png',
      transparent: true,
      ...wms,
    }
    this._pedido = 0
  },

  getEvents() {
    return { moveend: this._atualizar }
  },

  onAdd(map) {
    if (!map.getPane(this.options.pane)) {
      map.createPane(this.options.pane).style.zIndex = Z_PAINEL_WMS
    }
    this._atualizar()
  },

  onRemove(map) {
    this._cancelar()
    if (this._imagem) map.removeLayer(this._imagem)
    this._imagem = null
    this._urlAtual = null
  },

  /** Mesmo uso do L.TileLayer.WMS: troca parâmetros do GetMap e pede a imagem de novo. */
  setParams(params) {
    Object.assign(this.wmsParams, params)
    if (this._map) this._atualizar()
    return this
  },

  setZIndex(zIndex) {
    this.options.zIndex = zIndex
    this._imagem?.setZIndex(zIndex)
    return this
  },

  _cancelar() {
    this._pedido++
    this._controle?.abort()
    this._controle = null
    this._carregando = false
  },

  /** Caixa (em pixels do mapa) e URL do GetMap que cobre o mapa visível, com a folga. */
  _montarPedido() {
    const map = this._map
    const tamanho = map.getSize()
    if (!tamanho.x || !tamanho.y) return null
    const folga = tamanho.multiplyBy(FOLGA).round()
    const pixels = map.getPixelBounds()
    const min = pixels.min.subtract(folga)
    const max = pixels.max.add(folga)
    const sudoeste = map.unproject(L.point(min.x, max.y))
    const nordeste = map.unproject(L.point(max.x, min.y))
    const crs = map.options.crs
    const sw = crs.project(sudoeste)
    const ne = crs.project(nordeste)
    const chaveSrs = parseFloat(this.wmsParams.version) >= 1.3 ? 'crs' : 'srs'
    const params = {
      ...this.wmsParams,
      width: max.x - min.x,
      height: max.y - min.y,
      [chaveSrs]: crs.code,
      bbox: [sw.x, sw.y, ne.x, ne.y].join(','),
    }
    return {
      url: this._url + L.Util.getParamString(params, this._url, true),
      limites: L.latLngBounds(sudoeste, nordeste),
    }
  },

  _atualizar() {
    if (!this._map) return
    const pedido = this._montarPedido()
    if (!pedido) return
    if (pedido.url === this._urlAtual) {
      // Voltou para a vista que já está desenhada: o pedido que estava a caminho é de
      // outra vista e não pode mais substituir esta imagem.
      if (this._carregando) {
        this._cancelar()
        this.fire('load')
      }
      return
    }

    this._cancelar()
    const numero = this._pedido
    const mapa = this._map
    const atual = () => numero === this._pedido && this._map === mapa
    this._carregando = true
    this.fire('loading')

    const emCache = lerDoCache(pedido.url)
    let origem = Promise.resolve(emCache)
    if (!emCache) {
      this._controle = new AbortController()
      origem = baixarImagem(pedido.url, this._controle.signal)
    }

    origem
      .then((objeto) => {
        if (!atual()) return
        const nova = L.imageOverlay(objeto, pedido.limites, {
          pane: this.options.pane,
          zIndex: this.options.zIndex,
          opacity: this.options.opacity,
          className: this.options.className,
          interactive: false,
        })
        // A imagem anterior só sai quando a nova já está desenhada: nada de piscar.
        nova.once('load', () => {
          if (!atual()) {
            mapa.removeLayer(nova)
            return
          }
          if (this._imagem) mapa.removeLayer(this._imagem)
          this._imagem = nova
          this._urlAtual = pedido.url
          this._terminou()
        })
        nova.once('error', () => {
          mapa.removeLayer(nova)
          if (atual()) this._terminou(new Error('Imagem inválida'))
        })
        nova.addTo(mapa)
      })
      .catch((erro) => {
        if (erro?.name === 'AbortError' || !atual()) return
        this._terminou(erro)
      })
  },

  _terminou(erro) {
    this._carregando = false
    this._controle = null
    if (erro) this.fire('tileerror', { error: erro })
    this.fire('load')
  },
})

export function camadaWmsAutenticada(url, opcoes) {
  return new CamadaWmsAutenticada(url, opcoes)
}

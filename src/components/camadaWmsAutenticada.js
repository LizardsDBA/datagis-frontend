/**
 * Camada WMS do Leaflet que busca cada tile com o token do Keycloak (LIZARDS-35).
 *
 * O L.tileLayer.wms padrão põe a URL direto no <img>, e o navegador não manda
 * cabeçalho Authorization nesse caso — o proxy do backend recusaria. Aqui o tile é
 * baixado pelo apiFetch e entra no <img> como blob.
 */
import L from 'leaflet'
import { apiFetch } from '../services/http'

export const CamadaWmsAutenticada = L.TileLayer.WMS.extend({
  createTile(coords, done) {
    const tile = document.createElement('img')
    tile.alt = ''
    tile.setAttribute('role', 'presentation')

    apiFetch(this.getTileUrl(coords))
      .then(async (resposta) => {
        const tipo = resposta.headers.get('content-type') || ''
        // O GeoServer devolve erro como XML com HTTP 200 — não é imagem.
        if (!resposta.ok || !tipo.startsWith('image/')) {
          throw new Error(`Tile recusado: HTTP ${resposta.status} ${tipo}`)
        }
        return resposta.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        tile.onload = () => {
          URL.revokeObjectURL(url)
          done(null, tile)
        }
        tile.onerror = () => {
          URL.revokeObjectURL(url)
          done(new Error('Tile inválido'), tile)
        }
        tile.src = url
      })
      .catch((erro) => done(erro, tile))

    return tile
  },
})

export function camadaWmsAutenticada(url, opcoes) {
  return new CamadaWmsAutenticada(url, opcoes)
}

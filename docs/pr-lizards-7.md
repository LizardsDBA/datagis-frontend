# feat<LIZARDS-7>: adiciona tela Gold de tipos de indicadores e imóveis publicados

## Escopo

A LIZARDS-7 foi alinhada às funcionalidades Gold implementadas no backend: gestão
CRUD de `TipoIndicador` e consulta de `ImovelPublicado`.

A tela foi separada do módulo de Fontes para não misturar responsabilidades entre
Controle/Silver e Gold. O módulo entra como uma nova rota `/gold`, com duas abas:

- **Tipos de Indicador** — listagem, cadastro, edição e desativação (soft-delete).
- **Imóveis Publicados** — listagem somente leitura, filtro por código e detalhe.

## Backend consumido

- `GET /api/indicadores/tipos`
- `GET /api/indicadores/tipos/{id}`
- `POST /api/indicadores/tipos`
- `PUT /api/indicadores/tipos/{id}`
- `DELETE /api/indicadores/tipos/{id}`
- `GET /api/gold/imoveis`
- `GET /api/gold/imoveis/{codImovel}`

A tela não reimplementa regras de negócio do backend. O código do tipo permanece
bloqueado na edição; a normalização para maiúsculas e a validação definitiva ficam
no serviço Java.

## Frontend

Arquivos novos:

- `src/components/GoldView.vue`
- `src/components/GoldView.test.js`
- `src/services/goldService.js`

Arquivos integrados:

- `src/router/index.js` — rota `/gold`.
- `src/components/Sidebar.vue` — novo item de navegação.
- `src/App.vue` — título da topbar mobile para `/gold`.

A tela usa Axios exclusivamente no serviço. Os testes mockam o serviço/Axios e não
fazem chamada ao backend.

## Dependência nova

Na raiz do frontend:

```sh
docker compose up -d
docker compose exec frontend npm install axios
```

O `npm install` altera `package.json` e `package-lock.json`, permitindo que o
`npm install` automático do `docker-compose.yml` reconheça a dependência no volume
montado.

## Testes

```sh
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run build
```

Também revisar:

```sh
git diff --check
git status --short
git diff --name-only
```

## Proteção contra a PR de Fontes

A implementação não altera `src/components/CadastroFontes.vue`,
`ConstrutorCron.vue`, nem o fluxo de fontes. A única integração compartilhada é a
navegação (Sidebar/Router/App) e a nova dependência Axios.

Antes de abrir a PR, atualizar a branch com a `sprint-1` atualizada após a PR da
fonte ser integrada:

```sh
git fetch origin
git rebase origin/sprint-1
```

Depois conferir se `CadastroFontes.vue` permanece somente com as alterações do time
de Fontes.

## Limites

O backend de `ImovelPublicado` é somente leitura nesta entrega, portanto a tela não
oferece criar/editar/excluir imóveis. O detalhe consulta o endpoint por código,
mas não exibe a geometria Oracle diretamente; o objetivo desta fatia é o catálogo e
os indicadores publicados.

O endpoint `GET /api/gold/imoveis/{codImovel}` atualmente lança `RuntimeException`
quando o código não existe; a tela trata a falha de forma genérica sem introduzir
mudanças no backend nesta task.

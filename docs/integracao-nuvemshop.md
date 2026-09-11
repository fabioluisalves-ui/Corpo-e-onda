# Integração futura com a Nuvemshop (Tiendanube)

> **Status: DESATIVADA no MVP.** Nenhuma chamada externa é feita sem
> credenciais, autorização explícita e feature flag `NUVEMSHOP_ENABLED=true`.
> **Antes do go-live, confirme a versão atual da documentação oficial** (endpoints,
> cabeçalhos de webhook e algoritmo de HMAC podem mudar).

## Princípios

- O backend é a **fonte central** de estoque; a Nuvemshop é um **canal**.
- Camada desacoplada: `CommerceProvider` (interface) → `NuvemshopAdapter` (produção)
  e `MockCommerceProvider` (dev/testes).
- Tokens **criptografados** no banco (AES-256-GCM) e **nunca** enviados ao navegador.
- O **Code 128 interno não vai** para o campo barcode/GTIN da Nuvemshop.
  Sincroniza-se **SKU como SKU**; apenas um **GTIN oficial** vira barcode externo.

## Mapeamento

- Associação prioritária por **SKU exato** (`external_variant_mappings`).
- SKUs ausentes/duplicados são **bloqueados e relatados** (não sincroniza às cegas).
- Importação inicial com **modo simulação** antes de gravar.

## Pedidos (webhooks)

Gravar primeiro em `webhook_inbox` (idempotente via `dedupeKey`), validar HMAC com o
**corpo bruto** e processar de forma idempotente:

- `order/created` → cria **reserva** (`RESERVATION`).
- `order/paid` → converte reserva em **venda** (`RESERVATION_RELEASE` + `NUVEMSHOP_SALE`).
- `order/cancelled` / `order/voided` → **libera reserva** ou gera **devolução**
  (`CUSTOMER_RETURN`) conforme o estado anterior.
- Repetições **nunca** duplicam reserva/venda/devolução.
- A mesma variante pode aparecer em vários itens: usar o **id do item**, não só `variant_id`.

## Publicação de estoque

Após cada mudança válida, um **job assíncrono** (tabela `outbox_jobs`, worker com
backoff/retentativa) publica a **quantidade disponível** na Nuvemshop.
**Nunca** chamamos a API externa dentro da transação que confirma o movimento local.

Suporta `inventory_levels` e múltiplas localizações. Mantém indicador de última
sincronização e situação por SKU. Fila de erros com reprocessamento manual.

## OAuth 2

App Nuvemshop com OAuth2, escopos mínimos (produtos e pedidos). Fluxo de autorização
grava o token criptografado em `integrations.encryptedTokens`.

## Consulta pública

`GET /api/v1/public/availability/:sku` — somente leitura, rate-limited. **Nunca**
executa baixa/entrada. Serve para a loja consultar disponibilidade por SKU.

## Referências oficiais (conferir antes de implementar)

- Introdução: https://tiendanube.github.io/api-documentation/intro
- Produtos: https://tiendanube.github.io/api-documentation/resources/product
- Variantes: https://tiendanube.github.io/api-documentation/resources/product-variant
- Pedidos: https://tiendanube.github.io/api-documentation/resources/order
- Webhooks: https://tiendanube.github.io/api-documentation/resources/webhook
- Kits (somente leitura): https://tiendanube.github.io/api-documentation/resources/kit

> A **API de Kits é somente leitura**; kits são administrados pelo painel da loja.
> Não criar/alterar kits por essa API sem confirmar mudança na documentação oficial.

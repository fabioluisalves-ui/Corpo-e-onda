# Integração Nuvemshop — guia de ativação

A integração já está **implementada** e vem **desligada** por padrão
(`NUVEMSHOP_ENABLED=false`). Quando desligada, nada é enviado ou lido do canal.

O que a integração faz quando ativa:

- **Estoque → Nuvemshop (saída):** a cada movimento interno (entrada, venda, ajuste),
  um job `PUBLISH_STOCK` é enfileirado no outbox; um worker envia a quantidade
  disponível para a variante correspondente no canal (`PUT /products/{id}/variants/{id}`).
- **Vendas Nuvemshop → estoque (entrada):** o webhook `order/paid` gera baixa
  (`NUVEMSHOP_SALE`); `order/cancelled` gera devolução (`CUSTOMER_RETURN`). Idempotente
  por pedido+variante, então reprocessar o mesmo webhook não duplica baixa.
- **Mapeamento por SKU:** o endpoint de sync casa as variantes do canal com as internas
  pelo SKU e grava em `external_variant_mappings`.

## Princípios de segurança (importante)

- **Teste primeiro na loja demo gratuita** da Nuvemshop, nunca direto na produção.
- O webhook só produz efeito de estoque com **HMAC válido** (segredo do app).
- O `internal_barcode` (Code128 do SKU) **nunca** é enviado como GTIN/barcode do canal.
- O backend é a **fonte central** de estoque; a Nuvemshop é um canal.

## Passo 1 — Criar o "Aplicativo sob medida"

Para uma loja própria não é necessário virar parceiro nem implementar OAuth completo.
No painel da loja (planos Escala/Next): **Aplicativos → Aplicativo sob medida → criar**.

- Marque os escopos: **produtos (leitura e escrita)** e **pedidos (leitura)**.
- Ao final você recebe: **store_id** (número) e **access_token** (permanente).
- Guarde também o **client_secret** do app (para validar os webhooks).

## Passo 2 — Configurar as variáveis no Render (serviço `corpo-onda-api`)

```
NUVEMSHOP_ENABLED=true
NUVEMSHOP_STORE_ID=<store_id>
NUVEMSHOP_ACCESS_TOKEN=<access_token>
NUVEMSHOP_CLIENT_SECRET=<client_secret>
NUVEMSHOP_API_VERSION=2025-03
NUVEMSHOP_USER_AGENT=Corpo e Onda Estoque (contato@corpoonda.com.br)
```

A API reinicia e o worker de outbox começa a rodar (a cada 30s).

## Passo 3 — Mapear os SKUs

Autenticado como ADMIN/MANAGER, chame uma vez:

```
POST /api/v1/integrations/nuvemshop/sync-mappings
```

Retorna `{ matched, unmatched, total }`. Os SKUs internos precisam ser **iguais** aos
SKUs cadastrados na Nuvemshop (ex.: `TOP-MARE-AZC-P`). Ajuste divergências e rode de novo.

## Passo 4 — Registrar os webhooks na Nuvemshop

Aponte os eventos para a URL pública da API:

```
URL: https://corpo-onda-api.onrender.com/api/v1/integrations/nuvemshop/webhooks
Eventos: order/paid, order/cancelled
```

(O registro é feito via API de Webhooks da Nuvemshop, com o mesmo token do app.)

## Passo 5 — Publicar o estoque atual

Para empurrar o estoque já existente para o canal sem esperar novos movimentos:

```
POST /api/v1/integrations/nuvemshop/process-outbox
```

Também é possível conferir o estado:

```
GET /api/v1/integrations/nuvemshop/status
```

## Comportamento e limites (v1 da integração)

- **Baixa na venda** ocorre em `order/paid` (não em `order/created`). Reserva no pedido
  criado pode ser adicionada depois, se desejado.
- **Item sem mapeamento** é ignorado com aviso no log (não derruba o webhook).
- **Estoque insuficiente** para uma baixa é registrado no log; o webhook ainda responde 200.
- **Worker de outbox**: 1 instância, a cada 30s, com retentativa exponencial (até 6 tentativas).
  Para alto volume/múltiplas instâncias, migrar para uma fila dedicada.
- **API da Nuvemshop**: header de auth é `Authentication: bearer` (peculiaridade da
  plataforma) e `User-Agent` é obrigatório.

## Como desligar

Basta definir `NUVEMSHOP_ENABLED=false` (ou remover as credenciais). Nada é enviado
ou processado enquanto estiver desligada.

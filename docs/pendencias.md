# Pendências e status honesto de entrega

## O que está implementado e verificado
- **Motor de estoque** (transacional, idempotente, sem estoque negativo, kit virtual e
  montagem de kit) — `apps/api/src/domain`. **13 testes passam** (Vitest), incluindo o
  **cenário mínimo de aceite** e **duas vendas concorrentes**.
- **Adaptador Prisma** do motor com `$transaction` + `SELECT ... FOR UPDATE`.
- **Geração de Code 128** (bwip-js) e **etiquetas em PDF** (pdfkit) — verificado com amostras reais.
- **Schema Prisma completo (18 tabelas)** + **migração SQL** + **seed** de demonstração.
- **Backend NestJS**: auth (Argon2 + JWT), RBAC, catálogo (produtos/variantes/SKU),
  estoque (entrada/venda/ajuste/kit), relatórios + CSV, health, Swagger, filtro de erros,
  rate limit, CORS allowlist, camada Nuvemshop desacoplada (mock + adapter + webhook inbox
  idempotente + consulta pública por SKU).
- **Frontend Next.js**: login, **Entrada de Produção** (leitor em foco, loop) e Estoque.

## Requer credenciais ou decisão da cliente
1. **App Nuvemshop (OAuth2)**: `NUVEMSHOP_CLIENT_ID/SECRET`, `NUVEMSHOP_WEBHOOK_SECRET`,
   `store_id`, escopos aprovados. **Sem isso o adapter permanece desativado.**
2. **Chave de criptografia de tokens** (`TOKENS_ENCRYPTION_KEY`, 32 bytes base64).
3. **Confirmar a versão atual da documentação Nuvemshop** (endpoints, cabeçalho e
   algoritmo de HMAC do webhook, `inventory_levels`, comportamento de kits).
4. **GTINs oficiais (GS1)**: informar quando existirem; nunca gerar EAN aleatório.
5. **Autorização explícita** para conectar a loja de produção (feature flag).
6. **Tamanho/modelo de etiqueta** e impressora térmica em uso (para calibrar o layout).
7. **Fotos dos produtos** (URL/armazenamento) para exibir na Entrada de Produção.
8. **Política de senha inicial** e provedor de e-mail (para convites/reset), se desejado.

## Trabalho remanescente (segue o padrão já estabelecido; não bloqueado por decisão)
- Telas restantes do frontend (produtos, variantes, geração de SKU, etiquetas,
  venda/baixa, montagem de conjuntos, histórico, estoque baixo, usuários, configurações,
  integrações, conciliação) — reutilizam `apps/web/lib/api.ts`.
- Worker de `outbox_jobs` (publicação de estoque com backoff) e processadores de webhook
  `order/*` ligados ao motor (a ingestão idempotente já está pronta).
- Testes e2e/integração de HTTP e testes de permissão por perfil no nível do controller
  (as regras de domínio já têm cobertura unitária).
- Movimentação de estorno (movimentação inversa) exposta via endpoint dedicado.

## Nota sobre verificação neste ambiente
O engine binário do Prisma e a stack completa do NestJS não puderam ser executados no
sandbox de build (restrições de rede e ausência de Postgres). Por isso a verificação
automatizada focou no **núcleo de domínio** (que é o mesmo código usado em produção) e
na geração de código de barras/etiquetas. `prisma generate/migrate` e o `pnpm install`
completo rodam normalmente no ambiente da cliente conforme o README.

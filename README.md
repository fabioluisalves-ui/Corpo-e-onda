# Corpo & Onda Estoque

Sistema web de controle de estoque **por variante** (SKU) para a marca Corpo & Onda
(moda praia e fitness). Cada combinação de produto + cor + tamanho é uma variante
comercializável com SKU único, código de barras Code 128 interno e saldo próprio.

O **backend é a fonte central de estoque**. A Nuvemshop é tratada como canal de venda
(integração desacoplada, desativada por padrão no MVP).

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: Next.js 14 (App Router) + React + TypeScript strict + Tailwind
- **Backend**: NestJS 10 + TypeScript strict + REST versionada + OpenAPI/Swagger
- **Banco**: PostgreSQL 16 + Prisma
- **Auth**: JWT de curta duração + refresh; senhas com **Argon2id**
- **Código de barras**: Code 128 via `bwip-js` (biblioteca consolidada — as barras não são desenhadas à mão)
- **Etiquetas**: PDF via `pdfkit`
- **Dev**: Docker Compose, ESLint, Prettier, Vitest

## Requisitos

- Node.js 20–22 LTS
- pnpm 9+ (`corepack enable`)
- Docker (para o Postgres local) ou um PostgreSQL disponível

## Instalação local

```bash
# 1. Dependências
corepack enable
pnpm install

# 2. Variáveis de ambiente
cp .env.example .env
# edite .env e gere segredos fortes para JWT_ACCESS_SECRET e JWT_REFRESH_SECRET

# 3. Banco de dados (Postgres via Docker)
docker compose up -d db

# 4. Migrações + Prisma Client + seed de demonstração
pnpm --filter @corpo-onda/api prisma:generate
pnpm --filter @corpo-onda/api prisma:migrate
pnpm --filter @corpo-onda/api seed

# 5. Subir API e Web (em paralelo)
pnpm dev
```

- API: http://localhost:3333/api  •  Swagger: http://localhost:3333/api/docs
- Web: http://localhost:3000

### Usuários de demonstração (seed)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@corpoonda.com.br | MudarSenha123! |
| Gestor | gestor@corpoonda.com.br | MudarSenha123! |
| Operador de estoque | operador@corpoonda.com.br | MudarSenha123! |
| Consulta | consulta@corpoonda.com.br | MudarSenha123! |

> Troque todas as senhas em qualquer ambiente que não seja local.

## Testes

```bash
pnpm --filter @corpo-onda/api test
```

Cobrem: SKU único (case-insensitive), Code 128, entrada de produção, baixa manual,
bloqueio de estoque negativo, **duas vendas concorrentes**, idempotência,
montagem/desmontagem e cálculo de kit virtual.

## Fluxo vertical funcional (implementado e testado)

produto → variante → SKU + Code 128 → entrada de produção → saldo (projeção) → histórico (ledger imutável).

O motor de estoque (`apps/api/src/domain/inventory`) é **framework-agnostic** e é
exatamente o código exercitado pelos testes. Em produção ele roda sobre PostgreSQL
com `$transaction` + `SELECT ... FOR UPDATE` (`prisma-inventory.repository.ts`).

## Regras de negócio centrais

- Todo saldo muda **somente** por movimentação imutável no livro (`inventory_movements`).
  Correção = movimentação inversa (nunca edição/exclusão).
- `available = on_hand - reserved`. Modelagem já aceita múltiplas localizações.
- Estoque **nunca negativo**, salvo `ADJUSTMENT_OUT` autorizado (admin/gestor) com justificativa.
- **Idempotência**: operações aceitam `Idempotency-Key` (header) e há índice único
  `(orgId, idempotencyKey)` no banco — duplo clique / reenvio de webhook não duplica.
- SKU único **ignorando maiúsculas/minúsculas** (coluna `skuNormalized` com UNIQUE).
- `internal_barcode` (Code 128 do SKU) é distinto de `gtin` (EAN oficial GS1, opcional).
  O Code 128 interno **nunca** é enviado ao campo barcode/GTIN da Nuvemshop.

## Suposições assumidas

1. **Uma organização e um local de estoque** no MVP (`PRINCIPAL`), mas o modelo já
   suporta múltiplas localizações e múltiplas organizações.
2. **Serialização unitária desativada** (uma leitura + quantidade N = N unidades do mesmo SKU).
   O modelo permite ativar no futuro.
3. Valores monetários em **centavos** (`Int`).
4. Refresh token entregue no corpo no MVP; recomendação para produção (cookie httpOnly + rotação)
   documentada em `docs/plano-de-implantacao.md`.
5. Integração Nuvemshop **desativada** por feature flag; nenhuma chamada externa é feita.

## Estrutura

```
apps/
  api/   NestJS + Prisma (domínio, módulos, testes)
  web/   Next.js (login, entrada de produção, estoque; demais telas seguem o padrão)
docs/    plano de implantação, integração Nuvemshop, impressão/leitor, modelo de dados, pendências
```

Ver também: `docs/pendencias.md` (itens que dependem de credenciais ou decisão da cliente).

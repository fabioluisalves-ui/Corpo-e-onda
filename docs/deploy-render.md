# Deploy no Render — passo a passo

Pré-requisito: o projeto precisa estar num repositório Git (GitHub/GitLab) que o Render possa acessar.

## 1. Subir o código para o GitHub

```bash
cd corpo-onda-estoque
git init
git add .
git commit -m "Corpo & Onda Estoque — deploy inicial"
# crie um repositório vazio no GitHub e então:
git remote add origin https://github.com/SEU_USUARIO/corpo-onda-estoque.git
git branch -M main
git push -u origin main
```

## 2. Criar tudo pelo Blueprint

1. No Render: **New → Blueprint**.
2. Conecte a conta do GitHub e escolha o repositório.
3. O Render lê o `render.yaml` e mostra o que vai criar: **1 banco + API + site**. Clique em **Apply**.

## 3. Preencher os segredos da API

No serviço **corpo-onda-api → Environment**, defina (valores marcados como "sync:false" no blueprint):

| Variável | Valor |
|---|---|
| `JWT_ACCESS_SECRET` | segredo forte (o gerado na conversa) |
| `JWT_REFRESH_SECRET` | segredo forte (o gerado na conversa) |
| `TOKENS_ENCRYPTION_KEY` | chave base64 de 32 bytes (a gerada na conversa) |

`DATABASE_URL` é preenchida automaticamente pelo banco do próprio blueprint.

## 4. Ligar as duas URLs (passo obrigatório de 1ª vez)

Como a API e o site se referenciam, e o Next.js "assa" a URL da API no build, faça uma passada manual:

1. Após o 1º deploy, copie a URL pública de cada serviço (ex.: `https://corpo-onda-api.onrender.com` e `https://corpo-onda-web.onrender.com`).
2. Na **API**, defina `CORS_ORIGINS` = URL do site (ex.: `https://corpo-onda-web.onrender.com`).
3. No **site**, defina `NEXT_PUBLIC_API_URL` = URL da API + `/api/v1` (ex.: `https://corpo-onda-api.onrender.com/api/v1`).
4. Faça **Manual Deploy → Deploy latest commit** no site (para reassar com a URL correta).

## 5. Semear os dados de demonstração (uma vez)

No serviço **corpo-onda-api → Shell**:

```bash
pnpm --filter @corpo-onda/api seed
# se acusar ts-node ausente:
pnpm --filter @corpo-onda/api exec ts-node prisma/seed.ts
```

## 6. Validar

- Swagger: `https://corpo-onda-api.onrender.com/api/docs`
- Site: abra a URL do site, entre com `admin@corpoonda.com.br` / `MudarSenha123!`.
- Cenário de aceitação, apontando o script para produção:

```bash
API="https://corpo-onda-api.onrender.com/api/v1" bash scripts/smoke-test.sh
```

## Segurança (antes de uso real)

- **Troque as senhas** dos usuários de demonstração (o seed usa uma senha pública).
- Migre o banco para um **plano pago** (o `free` expira em 90 dias e é só para testes).
- Mantenha `NUVEMSHOP_ENABLED=false` até a integração ser implementada e autorizada.

## Migrações

`prisma migrate deploy` roda automaticamente a cada deploy (via `preDeployCommand` no blueprint).
Nada a fazer manualmente após o setup inicial.

## Custo aproximado

Dois serviços web no plano Starter (~US$7/mês cada) + banco. O plano Starter evita o
"cold start" (no plano free o serviço dorme após 15 min de inatividade — ruim para um
sistema de estoque em uso).

# Plano de implantação

## Ambientes
- **local**: Docker Compose (db + api + web).
- **staging**: banco gerenciado (ex.: RDS/Cloud SQL), API e Web em contêineres.
- **produção**: idem staging, com segredos em cofre (não em `.env` versionado).

## Passos
1. Provisionar PostgreSQL gerenciado; aplicar `prisma migrate deploy`.
2. Definir segredos (JWT, criptografia de tokens) via variáveis de ambiente/cofre.
3. Build das imagens (`apps/api/Dockerfile`, `apps/web/Dockerfile`).
4. Rodar migrações no deploy da API; **não** rodar seed em produção.
5. Configurar CORS allowlist (`CORS_ORIGINS`) com o domínio real do frontend.
6. Habilitar HTTPS/TLS no proxy reverso; cookies seguros quando usados.
7. Healthcheck `GET /api/v1/health` no orquestrador.

## Segurança / confiabilidade
- Validação de payloads (class-validator, `whitelist + forbidNonWhitelisted`).
- Autorização por perfil (RBAC) validada **no backend**.
- Rate limit global + específico em login (5/min) e webhooks (60/min).
- Helmet; segredos só em variáveis de ambiente; logs estruturados sem senhas/tokens.
- Auditoria de login e ações sensíveis (`audit_logs`).
- Paginação em listagens; índices no banco.

## Recomendações para produção (além do MVP)
- **Refresh token**: mover para cookie httpOnly + Secure + SameSite, com **rotação** e
  denylist de refresh revogado.
- Worker de `outbox_jobs` com backoff exponencial e DLQ (fila de erros).
- Política de **retenção de logs** e **backup** (ver abaixo).

## Backup (documentado)
- `pg_dump` diário + retenção de 30 dias; teste de restauração mensal.
- Snapshots automáticos do banco gerenciado.
- `inventory_movements` é a fonte da verdade: priorizar sua integridade nos backups.

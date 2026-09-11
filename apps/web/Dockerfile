FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @corpo-onda/web...
COPY apps/web apps/web
RUN pnpm --filter @corpo-onda/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@corpo-onda/web", "start"]

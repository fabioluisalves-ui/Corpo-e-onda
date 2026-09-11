FROM node:22-slim AS base
RUN corepack enable && apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @corpo-onda/api...
COPY apps/api apps/api
RUN pnpm --filter @corpo-onda/api prisma:generate && pnpm --filter @corpo-onda/api build
EXPOSE 3333
CMD ["node", "apps/api/dist/main.js"]

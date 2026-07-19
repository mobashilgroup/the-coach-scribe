# The Coach Scribe API + worker image. Build context = repository root:
#   docker build -f infra/docker/Dockerfile -t tcs-api .
#
# The same image runs the API (default CMD) or the worker (override CMD):
#   docker run tcs-api                         # API
#   docker run tcs-api pnpm exec tsx src/worker.ts   # worker

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps first (better layer caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/api/package.json services/api/package.json
RUN pnpm install --frozen-lockfile

# App source + Prisma client generation.
COPY . .
RUN pnpm --filter @tcs/api exec prisma generate

WORKDIR /app/services/api
ENV NODE_ENV=production
EXPOSE 4000

# Serve the static coach web app from the API by default.
ENV WEB_DIST_DIR=/app/apps/web_portal

CMD ["pnpm", "exec", "tsx", "src/server.ts"]

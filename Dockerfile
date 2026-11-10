# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
RUN npm install --global pnpm@12.18.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production \
    NAVIDROME_DB_PATH=/data/playlists.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
USER node
# Verify the native SQLite binding against the runtime image during the build.
RUN node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"
ENTRYPOINT ["node", "dist/cli.js"]

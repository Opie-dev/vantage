# The React app is built inside the image rather than copied in pre-built, so
# `docker compose up -d --build` can never ship a UI that is older than the source.
# Vite's outDir is ../public (see web/vite.config.js), which lands at /public here.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY --from=web /public ./public

# Nothing is written to disk any more (state lives in Postgres), so the app
# needs no write access to its own image.
USER node

EXPOSE 8123
CMD ["node", "server.js"]

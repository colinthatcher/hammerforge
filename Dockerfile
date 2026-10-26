FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/prepare-vendor.mjs ./scripts/prepare-vendor.mjs
COPY scripts/version.mjs ./scripts/version.mjs
RUN npm ci
ARG GIT_REVISION=unknown
ARG BUILD_DATE
RUN BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" GIT_REVISION="${GIT_REVISION}" node scripts/version.mjs /app/health.json

FROM nginx:stable-alpine

COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY index.html *.js *.css /usr/share/nginx/html/
COPY combat/ /usr/share/nginx/html/combat/
COPY data/game-data.json /usr/share/nginx/html/data/game-data.json
COPY --from=dependencies /app/vendor/ /usr/share/nginx/html/vendor/
COPY --from=dependencies /app/health.json /etc/nginx/health.json

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

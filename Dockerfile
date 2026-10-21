FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/prepare-vendor.mjs ./scripts/prepare-vendor.mjs
RUN npm ci

FROM nginx:stable-alpine

COPY index.html *.js *.css /usr/share/nginx/html/
COPY combat/ /usr/share/nginx/html/combat/
COPY data/game-data.json /usr/share/nginx/html/data/game-data.json
COPY --from=dependencies /app/vendor/ /usr/share/nginx/html/vendor/

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

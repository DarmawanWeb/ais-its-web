# syntax=docker/dockerfile:1.7
#
# ais-its-web image (docs/PLATFORM_SPEC.md §11, §14): the Vite build (node:24-alpine) served
# by nginx:1.29-alpine as the unprivileged user "nginx" on port 8080. Registry credentials only
# arrive as BuildKit secrets, never as build arguments or layers:
#   - npmrc (required): an .npmrc mapping @darmawanweb to its registry with a token
#   - ca (optional): an extra CA bundle for TLS-intercepting proxies
#
#   DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc -t ais-its-web .
#
# Runtime configuration: VITE_* environment variables of the container are written to
# /config.js at start (docker/40-runtime-config.sh), so one image serves every environment.

# --- build: dependencies and the static bundle ----------------------------------
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=ca,target=/tmp/build-ca.crt,required=false \
    if [ -s /tmp/build-ca.crt ]; then export NODE_EXTRA_CA_CERTS=/tmp/build-ca.crt; fi; \
    corepack enable && corepack install
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    --mount=type=secret,id=ca,target=/tmp/build-ca.crt,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -s /tmp/build-ca.crt ]; then export NODE_EXTRA_CA_CERTS=/tmp/build-ca.crt; fi; \
    pnpm install --frozen-lockfile --ignore-scripts
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
ARG APP_VERSION=0.1.0
ENV VITE_APP_VERSION=$APP_VERSION \
    VITE_APP_ENV=production
# Type checking runs in CI (pnpm typecheck); the image only bundles. Source maps stay out
# of the public web root.
RUN pnpm exec vite build && find dist -name '*.map' -delete

# --- runtime: nginx, non-root -----------------------------------------------------
FROM nginx:1.29-alpine AS runtime
ENV NGINX_ENTRYPOINT_QUIET_LOGS=1
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=0755 docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]

# One image for the whole app: the Fastify API also serves the built React frontend.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build -w @franks/core \
 && npm run build -w @franks/server \
 && npm run build -w @franks/web

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/apps/web/dist     PHOTO_DIR=/app/data/photos
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
# The gallery's photos, on a volume (docker-compose.yml). A new volume takes this folder's owner,
# so the app can write to it.
RUN mkdir -p data/photos && chown node:node data/photos
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]

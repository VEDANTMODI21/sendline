# Single image: Express API + BullMQ worker + the built React app (served same-origin).
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /api
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 WEB_DIST_DIR=/app/web
WORKDIR /app
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=api /api/migrations ./migrations
COPY --from=api /api/package.json ./
COPY --from=web /web/dist ./web
USER node
EXPOSE 4000
# ROLE=all runs API + worker in one process; set ROLE=api / ROLE=worker to split them.
CMD ["node", "dist/main.js"]

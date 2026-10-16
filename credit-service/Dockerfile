# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
# Scope: Generated the two-stage build and runtime image, following supplier-service/Dockerfile.
# Author review: pending — Jian Bing to record what he checked.
#
# Build context is this folder:
#
#   docker build -t foc-credit-service credit-service

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3004
CMD ["node", "dist/main.js"]

# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
# Scope: Generated the two-stage build and runtime image, following supplier-service/Dockerfile.
# Author review: pending — Cole Lin to record what he checked.
#
# Build context is the REPOSITORY ROOT, to match the other services:
#
#   docker build -f logging-service/Dockerfile -t foc-logging-service .

FROM node:22-alpine AS build
WORKDIR /app
COPY logging-service/package.json logging-service/package-lock.json ./
RUN npm ci
COPY logging-service/tsconfig.json logging-service/nest-cli.json ./
COPY logging-service/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY logging-service/package.json logging-service/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3005
CMD ["node", "dist/main.js"]

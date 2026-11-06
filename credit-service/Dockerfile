# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
# Scope: Generated the two-stage build and runtime image, following supplier-service/Dockerfile.
# Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
# Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
# Author review: Jian Bing supplied what it states; the wording is Claude's.
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

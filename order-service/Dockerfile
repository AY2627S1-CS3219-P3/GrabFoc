# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-13
# Scope: Implemented the user-approved Order database-only plan.
# Author review: Design and plan approved by user; implementation review pending.
# AI-generated; human review pending.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
RUN npm run build

FROM build AS test
CMD ["node", "--test", "dist/test/*.test.js"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/db ./dist/db
COPY --from=build /app/migrations ./migrations
USER node
CMD ["node", "dist/db/migrate-cli.js"]

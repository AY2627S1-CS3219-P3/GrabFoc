# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-13
# Scope: Implemented the user-approved Order database-only plan.
# Author review: Design and plan approved by user; implementation review pending.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
# Scope: Phase A: test stage runs unit and integration tests; runtime image serves HTTP.
# Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
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
CMD ["node", "--test", "dist/**/*.spec.js", "dist/test/*.test.js"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3005
# order-migrate overrides this with dist/db/migrate-cli.js.
CMD ["node", "dist/main.js"]

# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
# Scope: Generated from notification-service/Dockerfile and order-service/Dockerfile (migrations,
#        test stage), per the chat plan
# Author review: Reviewed by Deanson, 2026-11-09.
#
# Build context is this folder:
#
#   docker build -t foc-chat-service chat-service

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json jest.int.config.js ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# compose.test.yaml runs the unit and database tests here.
FROM build AS test
CMD ["sh", "-c", "npx jest && npx jest --config jest.int.config.js"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3007
# chat-migrate overrides this with dist/db/migrate-cli.js.
CMD ["node", "dist/main.js"]

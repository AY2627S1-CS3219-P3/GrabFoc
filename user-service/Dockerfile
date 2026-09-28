# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
# Scope: Generated the two-stage build and runtime image.
# Author review: Read in full; verified the full stack builds and runs, and that the database survives a down/up cycle.

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
# The migration runner reads these at startup, so they must be in the image.
COPY migrations ./migrations
EXPOSE 3001
CMD ["node", "dist/main.js"]

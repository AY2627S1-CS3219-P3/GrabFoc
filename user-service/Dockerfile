# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
# Scope: Adapted from user-service/Dockerfile (original disclosure: Claude Code, Claude Opus 5, 2026-09-25):
#        also copies tsconfig.build.json, migrations now live in db/migrations, and the base image is
#        node:24-alpine (npm 11, matching the lock file; npm 10 in node:22 rejects it with npm ci).
#        2026-10-16: the folder was renamed from refactored-user-service/ to user-service/ (the old
#        service is archived in old-user-service/).
# Author review: Successfully reviewed by Deanson, 2026-10-16.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# The migration runner reads these at startup, so they must be in the image.
COPY db/migrations ./db/migrations
EXPOSE 3001
CMD ["node", "dist/main.js"]

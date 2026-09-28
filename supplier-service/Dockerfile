# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5), date: 2026-09-28
# Scope: Generated the two-stage build and runtime image, following the pattern in
#        user-service/Dockerfile.
# Author review: pending — to be completed by the reviewing team member.
#
# Build context is the REPOSITORY ROOT, not this folder, because the seed CSV lives in
# data/ outside supplier-service/ (team decision):
#
#   docker build -f supplier-service/Dockerfile -t foc-supplier-service .

FROM node:22-alpine AS build
WORKDIR /app
COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci
COPY supplier-service/tsconfig.json supplier-service/nest-cli.json ./
COPY supplier-service/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# The seed loader reads this at startup, so the CSV has to be in the image.
COPY data/csv ./data/csv
ENV SUPPLIER_SEED_CSV=/app/data/csv/supplier-seed-data.csv
EXPOSE 3002
CMD ["node", "dist/main.js"]

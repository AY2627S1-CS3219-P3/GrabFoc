# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-27
# Scope: Added container build for the API Gateway; aligned exposed port with the service defaults.
# Author review: Pending gateway owner review.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3003
CMD ["node", "dist/server.js"]

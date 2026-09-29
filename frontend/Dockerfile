# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Added a production Next.js container build for the frontend Compose service.
# Author review: Pending Jie Yang's review and container smoke test.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG FRONTEND_GATEWAY_URL=http://api-gateway:3003
ENV FRONTEND_GATEWAY_URL=${FRONTEND_GATEWAY_URL}
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
ENV FRONTEND_GATEWAY_URL=http://api-gateway:3003
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]

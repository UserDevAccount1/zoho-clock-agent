# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:22-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*
RUN npx playwright install-deps chromium

COPY package*.json ./
RUN npm ci
RUN npx playwright install chromium

COPY server/ ./server/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Include seed data
COPY server/data/accounts.json ./server/data/accounts.json

RUN mkdir -p screenshots server/data

ENV PORT=3847
EXPOSE 3847

CMD ["node", "server/index.js"]

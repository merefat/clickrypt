---
description: How to set up and run the Clickrypt development environment
---

# Clickrypt Development Setup

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm@9`)
- **Docker Desktop** (running, with WSL2 backend on Windows)

## Steps

1. **Install dependencies**
   ```
   pnpm install
   ```

2. **Generate Prisma client**
   ```
   cd apps/api
   npx prisma generate
   ```

3. **Sync database schema**
   ```
   cd apps/api
   npx prisma db push
   ```
   Or use migrations: `npx prisma migrate dev --name <name>`

4. **Seed the database (optional)**
   ```
   cd apps/api
   pnpm prisma:seed
   ```

5. **Start all services (Docker + API + Web)**
   ```
   pnpm dev
   ```
   This runs:
   - Docker containers (postgres, redis, mailhog)
   - NestJS API on `http://localhost:4001`
   - Next.js web on `http://localhost:3000`

6. **Or start services individually**
   - API only: `pnpm dev:api`
   - Web only: `pnpm dev:web`
   - Docker only: `docker compose -f infra/docker/docker-compose.dev.yml up -d`

7. **Verify**
   - Web: http://localhost:3000
   - API health: http://localhost:4001/api/v1/health
   - API docs: http://localhost:4001/api/docs
   - MailHog UI: http://localhost:8025

## Environment Variables

The API reads from `apps/api/.env`. See `.env.example` for required values:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — At least 16 characters
- `API_PORT` — Default 4001
- `WEB_ORIGIN` — Default http://localhost:3000

The web app defaults to `http://localhost:4001/api/v1` for API calls. Override with `NEXT_PUBLIC_API_URL` if needed.

## Troubleshooting

- **Prisma generate fails (EPERM on Windows)**: Stop any running API dev server, then retry `npx prisma generate`.
- **404 on all pages**: Ensure the web dev server is running (`pnpm dev:web`).
- **Database connection refused**: Ensure Docker containers are up (`docker compose -f infra/docker/docker-compose.dev.yml up -d`).

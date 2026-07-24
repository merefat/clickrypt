# Clickrypt

A zero-knowledge password manager for teams. Secrets are encrypted in the browser with
OpenPGP before they ever reach the server — the backend only stores ciphertext.

See [PLAN.md](./PLAN.md) for the full architecture and roadmap.

## Repository layout

```
apps/api        NestJS backend (REST API, /api/v1)
apps/web        Next.js frontend
packages/crypto Shared client-side crypto core (OpenPGP.js + Argon2id)
infra/docker    Local dev stack (Postgres, Redis, MailHog)
```

## Prerequisites

- Node.js >= 20
- pnpm 9 (`npm install -g pnpm@9`)
- Docker Desktop (for Postgres/Redis)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis + MailHog
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 3. Configure the API environment
cp .env.example apps/api/.env

# 4. Create the database schema and seed defaults
pnpm --filter @clickrypt/api prisma:migrate
pnpm --filter @clickrypt/api prisma:seed

# 5. Run the apps (in two terminals)
pnpm --filter @clickrypt/api dev    # API  -> http://localhost:3001/api/v1
pnpm --filter @clickrypt/web dev    # Web  -> http://localhost:3000
```

API docs (Swagger) are served at `http://localhost:3001/api/docs`.

## Testing

```bash
pnpm test                                # all workspace tests
pnpm --filter @clickrypt/crypto test     # crypto core round-trip tests
```

## Security model (summary)

- Key pairs are generated client-side; the private key is encrypted with an
  Argon2id-derived key from the user's passphrase before upload.
- Login is a GPG challenge-response — the server never sees a password.
- Each shared secret is stored as one ciphertext per recipient.
- The unlocked vault key lives in memory only and is wiped on lock/logout/idle.

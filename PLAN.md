# Clickrypt — Implementation Plan (v2)

A zero-knowledge password manager modeled on Passbolt's feature set. This document is the
build blueprint: monorepo layout, backend/frontend architecture, security model, and a
milestone-by-milestone execution order.

---

## 0. Progress Tracker (updated Jul 2026)

### Milestone 0 — Scaffold ✅ COMPLETE
- [x] pnpm monorepo with workspaces (`pnpm-workspace.yaml`)
- [x] Docker Compose dev stack (Postgres, Redis, MailHog) — `infra/docker/docker-compose.dev.yml`
- [x] CI pipeline (install, Prisma generate, build, test) — `.github/workflows/ci.yml`
- [x] Full Prisma schema (all 17 models defined) — `apps/api/prisma/schema.prisma`
- [x] Prisma migration applied (`init`) + seed script — `apps/api/prisma/seed.ts`
- [x] Health check endpoint — `apps/api/src/health/`
- [x] API boots at `http://localhost:3001/api/v1`, web at `http://localhost:3000`
- [ ] `turbo.json` — not created (using pnpm workspace scripts instead; optional)
- [ ] `packages/types` — shared TypeScript types + zod schemas (not yet created)
- [ ] `packages/config` — shared eslint/tsconfig/tailwind presets (not yet created)

### Milestone 1 — Crypto Core ✅ COMPLETE
- [x] `packages/crypto` with full API:
  - `encoding.ts` — base64/utf8/random bytes helpers
  - `kdf.ts` — Argon2id key derivation + params generation
  - `keys.ts` — OpenPGP keypair generation, fingerprint reading
  - `messages.ts` — encrypt/decrypt messages, detached sign/verify
  - `wrap.ts` — passphrase-based private key encryption/decryption (EncryptedBlob)
  - `recovery-kit.ts` — create/parse recovery kit JSON
- [x] 15/15 unit tests passing (vitest round-trip tests)

### Milestone 2 — Identity ✅ COMPLETE
- [x] **API — Auth module** (`apps/api/src/auth/`):
  - `POST /auth/verify` — challenge-response with OpenPGP encrypt-only, decoy challenges for user enumeration resistance
  - `POST /auth/login` — token verification, JWT issuance
  - `POST /auth/refresh` — refresh token rotation with reuse detection (Redis-backed)
  - `POST /auth/logout` — session revocation
  - `JwtAuthGuard`, `CurrentUser` decorator, `AccessTokenPayload` with `jti`
- [x] **API — Users module** (`apps/api/src/users/`):
  - `POST /users/register` — email + names + armored public key + encrypted private key blob (Zod-validated)
  - `GET /users/me` — current user profile with fingerprint
  - `GET /users` — list org users
  - `GET /users/:id/public-key` — fetch armored public key
- [x] **API — Cross-cutting**:
  - `PrismaModule`, `RedisModule` (wrapping ioredis), `CommonModule` (@Global ThrottleGuard)
  - Redis-backed rate limiting on auth endpoints
  - Session table + Redis session index
- [x] **API — Tests**: 11/11 e2e tests passing (`apps/api/test/auth.e2e.test.ts`)
- [x] **Web — Pages**:
  - `/` — landing page with feature highlights
  - `/register` — full registration flow (form → keygen → recovery kit download → auto-login)
  - `/login` — two-step login (email → passphrase → challenge decrypt → vault)
  - `/vault` — placeholder showing user profile (awaiting Milestone 3)
- [x] **Web — Infrastructure**:
  - `lib/api/client.ts` — typed API client with auto-refresh on 401
  - `stores/session.ts` — Zustand store: unlocked private key (memory only), auto-lock timer (15 min)
- [ ] TanStack Query — not yet installed (using raw fetch + useState)
- [ ] shadcn/ui — not yet installed (using raw Tailwind classes)
- [ ] `beforeunload` auto-lock — not yet wired
- [ ] zxcvbn passphrase strength meter — not in register page

### Milestone 3 — Vault MVP ⬜ NEXT (detailed plan in §7 below)

### Milestone 4 — Sharing ⬜ NOT STARTED

### Milestone 5 — MFA + Admin ⬜ NOT STARTED

### Milestone 6 — Extension ⬜ NOT STARTED

### Milestone 7 — Team-ready ⬜ NOT STARTED

### Milestone 8 — Enterprise ⬜ NOT STARTED

---

## 1. Monorepo layout (pnpm workspaces + Turborepo)

```
Clickrypt/
├── apps/
│   ├── api/                  # NestJS backend (REST, /api/v1)
│   ├── web/                  # Next.js 14 App Router frontend
│   └── extension/            # Browser extension (MV3) — Milestone 6
├── packages/
│   ├── crypto/               # OpenPGP.js wrappers — pure functions, zero deps on UI/API
│   ├── types/                # Shared TypeScript types + zod schemas (API contracts)
│   └── config/               # Shared eslint/tsconfig/tailwind presets
├── infra/
│   ├── docker/               # Dockerfiles + docker-compose.dev.yml (Postgres, Redis, MailHog)
│   └── github/               # CI workflows
├── turbo.json
└── pnpm-workspace.yaml
```

**Why this shape:** `packages/crypto` and `packages/types` are shared verbatim by web,
extension, and later desktop/mobile. No crypto logic ever lives in `apps/api`.

---

## 2. Backend (apps/api) — NestJS + Prisma + PostgreSQL + Redis

### Modules (NestJS module per domain)

| Module | Responsibility |
|---|---|
| `auth` | GPG challenge-response login, JWT access + refresh (Redis-backed sessions), MFA hooks |
| `users` | Registration, profile, public-key directory, admin suspend/delete |
| `gpg-keys` | Store public key + encrypted private key blob; fingerprint validation |
| `resources` | Vault item metadata CRUD (never plaintext secrets) |
| `secrets` | One ciphertext row per (resource, recipient); create/rotate/revoke |
| `sharing` | Share flow orchestration: permission grant + ciphertext insertion (transactional) |
| `permissions` | ARO/ACO model (user/group × resource/folder), permission resolution service |
| `folders` | Flat in MVP, `parent_folder_id` nullable from day one for nesting later |
| `groups` | Milestone 7 — group CRUD, membership, group-share fan-out |
| `tags` | Org-scoped tags, resource-tag joins |
| `mfa` | TOTP (otplib) enrollment + verification; WebAuthn later |
| `audit` | Append-only audit log writes via event bus; query API (admin) |
| `orgs` | `org_id` scoping baked into every table from day one (single org in MVP) |
| `jobs` | BullMQ: emails, audit fan-out, expiry checks (separate worker entrypoint) |

### Auth flow (challenge-response)

1. `POST /api/v1/auth/verify` `{ email }` → server generates random token, encrypts with
   user's public key (server-side OpenPGP *encrypt-only* — no private-key ops), stores
   token hash in Redis (TTL 2 min), returns ciphertext.
2. Client decrypts with unlocked private key, `POST /api/v1/auth/login` `{ email, token }`.
3. Server compares hash, issues access JWT (15 min) + refresh token (httpOnly cookie,
   rotated, hash stored in Redis).
4. If MFA enrolled → login response returns `mfa_required`; `POST /auth/mfa/verify`
   upgrades the session.

### Data model (Prisma, all tables org-scoped)

Tables per the schema in the architecture doc: `users`, `gpg_keys`, `organizations`,
`roles`, `groups`, `group_users`, `folders`, `resource_types`, `resources`, `secrets`,
`permissions` (ARO/ACO), `tags`, `resource_tags`, `share_history`, `audit_logs`,
`sessions`, `mfa_devices`, `recovery_requests`.

Key invariants enforced at the service layer:
- A `secrets` row exists for every user with ≥ READ permission on the resource
  (share endpoint validates the client supplied ciphertexts for all new recipients).
- Deleting a permission cascades deletion of that recipient's `secrets` row.
- `permission_level`: 1=READ, 7=UPDATE, 15=OWNER (Passbolt-compatible values).

### API surface (MVP)

```
POST   /auth/verify | /auth/login | /auth/logout | /auth/refresh | /auth/mfa/verify
POST   /users/register            # email + names + public key + encrypted private key
GET    /users/me | /users | /users/:id/public-key
GET/POST        /resources        # list is permission-filtered
GET/PUT/DELETE  /resources/:id
GET    /resources/:id/secret      # returns caller's ciphertext only
POST   /resources/:id/share       # { recipients: [{user_id, permission, encrypted_data}] }
DELETE /resources/:id/share/:userId
GET    /resources/:id/permissions
GET/POST/PUT/DELETE /folders(/:id)
GET/POST/DELETE /tags, POST /resources/:id/tags
GET/POST/DELETE /mfa/totp
GET    /audit-logs                # admin, paginated + filterable
```

OpenAPI spec auto-generated (`@nestjs/swagger`) → typed client generated into
`packages/types` (openapi-typescript) so frontend/backend never drift.

### Cross-cutting

- **Validation:** zod DTOs shared from `packages/types`.
- **Rate limiting:** Redis-backed, aggressive on `/auth/*`.
- **Audit:** NestJS event emitter → BullMQ → append-only `audit_logs`.
- **Config:** env-validated at boot (fail fast); secrets never logged.
- **Testing:** unit (services), e2e (supertest against dockerized Postgres),
  crypto round-trip tests in `packages/crypto` (vitest).

---

## 3. Frontend (apps/web) — Next.js 14 + Tailwind + shadcn/ui

### Routes

```
Public (SSR):   /  /login  /register  /security
App (client):   /vault  /vault/[resourceId]  /groups  /settings/{account,mfa,keys}
Admin:          /admin/users  /admin/audit-logs
```

### State layers

- **TanStack Query** — all server data (resources, folders, users, permissions).
- **Zustand (in-memory only)** — session status, unlocked private key, vault-lock timer.
  Never persisted. `lock()` zeroizes the key and clears decrypted caches.
- **Auto-lock:** idle timeout (default 15 min), tab-close via `beforeunload`, explicit
  lock button. All three call the same `lock()`.

### Key UX flows

1. **Register:** form → `packages/crypto` generates keypair → passphrase (zxcvbn strength
   meter) → Argon2id-encrypt private key → upload public + encrypted private →
   force Recovery Kit download before completing.
2. **Login:** email → challenge ciphertext → passphrase prompt → decrypt → submit →
   (MFA) → vault.
3. **Vault:** virtualized list, folder sidebar, tag filter, search (metadata only).
   Secret reveal/copy decrypts on demand, clipboard auto-clear after 30s.
4. **Share dialog:** pick users → fetch their public keys → decrypt locally → re-encrypt
   per recipient → single share request.
5. **Settings/keys:** fingerprint display, re-download recovery kit, passphrase change
   (re-encrypt private key blob client-side, upload new blob).

### Component layout

```
src/
├── app/                     # routes
├── components/{vault,sharing,admin,ui}/
├── lib/api/                 # generated typed client + TanStack Query hooks
├── lib/crypto/              # thin re-export of packages/crypto + web-only helpers
└── stores/                  # zustand: session.ts, vault-lock.ts
```

---

## 4. Security guarantees (non-negotiable checklist)

- [x] Private keys and plaintext secrets never leave the client.
- [x] Server does encrypt-only OpenPGP (login challenge); zero private-key operations.
- [x] Unlocked key lives in memory only; wiped on lock/logout/idle (tab-close pending).
- [x] Passphrase → Argon2id (memory-hard) for private-key encryption.
- [ ] CSP with no `unsafe-eval`; SRI on extension assets; strict CORS.
- [x] Refresh tokens httpOnly + SameSite=Strict, rotated on use, revocable via Redis.
- [ ] Compromised-password check (later) uses HIBP k-anonymity, client-side only.
- [x] Recovery = encrypted recovery kit only. No admin backdoor in MVP.

---

## 5. Milestones (build order)

| # | Milestone | Contents | Exit criteria |
|---|---|---|---|
| 0 | **Scaffold** | Monorepo, docker-compose (Postgres/Redis/MailHog), CI (lint/test/build), Prisma schema + migrations, seed script | `pnpm dev` boots api+web; CI green |
| 1 | **Crypto core** | `packages/crypto`: keygen, encrypt/decrypt, sign/verify, Argon2id key wrap, recovery-kit format | Round-trip unit tests pass |
| 2 | **Identity** | Register (key upload), challenge-response login, sessions, refresh, logout, `/users/me` | Full auth e2e test green |
| 3 | **Vault MVP** | Resources + secrets CRUD, folders (flat), tags, vault UI with unlock gate, auto-lock, copy/reveal | Create→lock→unlock→decrypt round trip in browser |
| 4 | **Sharing** | Permissions (ARO/ACO), share dialog with client-side re-encryption, revoke, share history | Two-user share e2e green |
| 5 | **MFA + Admin** | TOTP enroll/verify, admin user list + suspend/delete, audit log (write + admin view) | MFA-gated login works |
| 6 | **Extension** | MV3 Chrome extension: unlock, autofill, save-on-submit; shares `packages/crypto` | Autofill works on test pages |
| 7 | **Team-ready** | Groups (+ group sharing fan-out), nested folders, CSV/Bitwarden import, favorites/search polish | Phase 2 feature parity |
| 8 | **Enterprise** | SSO (OIDC→SAML), SCIM, self-host Docker Compose package, public API keys + CLI | Phase 3 per architecture doc |

Milestones 0–5 = Phase 1 MVP. Each milestone is shippable and independently testable.

---

## 7. Detailed Execution Plan — Remaining Work

### Phase 1: Milestone 3 — Vault MVP (NEXT)

**Goal:** Create → lock → unlock → decrypt a password entry in the browser.

#### 3A. Backend — Resources & Secrets module

1. **Create `resources` module** (`apps/api/src/resources/`)
   - `resources.module.ts`, `resources.controller.ts`, `resources.service.ts`
   - `POST /resources` — create resource (name, uri, folderId, metadata) + caller's secret ciphertext
     - Validates `encryptedData` is a valid OpenPGP armored message
     - Creates `Resource` row + `Secret` row for the caller in a transaction
     - Auto-creates a `Permission` row (OWNER level) for the creator
   - `GET /resources` — list resources visible to caller (permission-filtered)
     - Join `permissions` where `aroType=USER, aroId=callerId, acoType=RESOURCE`
     - Return metadata only (no secrets)
   - `GET /resources/:id` — single resource metadata (permission-checked)
   - `PUT /resources/:id` — update metadata (requires UPDATE permission)
   - `DELETE /resources/:id` — delete resource (requires OWNER permission)
     - Cascades to `secrets`, `permissions`, `resource_tags`
   - `GET /resources/:id/secret` — return caller's ciphertext only
     - Look up `Secret` where `resourceId + userId = caller`
     - Return `{ encryptedData }` — client decrypts locally

2. **Create `folders` module** (`apps/api/src/folders/`)
   - `POST /folders` — create folder (name, optional parentFolderId)
   - `GET /folders` — list folders in caller's org
   - `PUT /folders/:id` — rename
   - `DELETE /folders/:id` — delete (must be empty or cascade)

3. **Create `tags` module** (`apps/api/src/tags/`)
   - `POST /tags` — create org-scoped tag (name, color)
   - `GET /tags` — list org tags
   - `DELETE /tags/:id` — delete tag
   - `POST /resources/:id/tags` — attach tag to resource
   - `DELETE /resources/:id/tags/:tagId` — remove tag from resource

4. **Create `permissions` module** (`apps/api/src/permissions/`)
   - `permissions.service.ts` — `resolvePermission(userId, resourceOrFolderId)` → READ | UPDATE | OWNER | null
   - Used by resources controller for authorization checks
   - `GET /resources/:id/permissions` — list permissions for a resource (OWNER only)

5. **DTOs + validation**
   - `CreateResourceDto`, `UpdateResourceDto`, `CreateFolderDto`, `CreateTagDto`
   - Use class-validator (consistent with existing auth DTOs)

6. **Seed default resource type**
   - Add `password` resource type to seed script (name="password", schemaJson with fields: username, password, uri, notes)

7. **E2E tests** (`apps/api/test/resources.e2e.test.ts`)
   - Register two users → user A creates resource → fetches & decrypts secret
   - User B cannot see user A's resource (403/404)
   - Update resource metadata
   - Delete resource
   - Folder + tag CRUD

#### 3B. Frontend — Vault UI

1. **Install dependencies**
   - `@tanstack/react-query` for server state
   - `shadcn/ui` + Radix primitives for components (dialog, dropdown, toast)
   - `zxcvbn` for passphrase strength (backfill into register page)

2. **API client extensions** (`lib/api/client.ts`)
   - Add typed methods: `listResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`, `getSecret`, `listFolders`, `createFolder`, `listTags`, `createTag`, `deleteTag`, `attachTag`, `detachTag`

3. **Vault page rewrite** (`/vault`)
   - **Sidebar:** folder tree (flat for MVP), "All Items" filter, tag filter chips
   - **Main area:** virtualized resource list (name, uri, tags, updated date)
   - **Search bar:** client-side metadata search (name/uri only — never plaintext)
   - **"New password" button:** opens create dialog
   - **Resource detail panel/dialog:** name, URI, username, password (masked), notes
   - **Reveal/Copy:** decrypt on demand using `decryptMessage(encryptedData, privateKey)` from session store
   - **Clipboard auto-clear:** `navigator.clipboard.writeText` then clear after 30s

4. **Create resource dialog**
   - Fields: name, URI, username, password, notes, folder (optional), tags (optional)
   - On submit: encrypt the secret payload with caller's own public key → `POST /resources`
   - Use `encryptMessage(plaintext, publicKey)` from `@clickrypt/crypto`

5. **Edit resource dialog**
   - Pre-fill metadata fields
   - If password changed: re-encrypt with caller's public key → `PUT /resources/:id`

6. **Auto-lock improvements**
   - Wire `beforeunload` event → call `lock()`
   - Wire visibility change / mouse move → `resetLockTimer()`
   - Add explicit "Lock vault" button in header

7. **Settings page skeleton** (`/settings/account`)
   - Show profile (email, name, role, fingerprint)
   - Placeholder for passphrase change (Milestone 4+)

#### 3C. Exit Criteria
- [ ] Create a password entry in the browser → lock vault → unlock → decrypt & reveal password
- [ ] Folder and tag filtering works
- [ ] Auto-lock fires on idle timeout
- [ ] Resources e2e test green
- [ ] Web build clean

---

### Phase 2: Milestone 4 — Sharing

1. **Backend — Share endpoint**
   - `POST /resources/:id/share` — body: `{ recipients: [{ userId, permission, encryptedData }] }`
     - Validate caller has OWNER permission
     - Validate each recipient's public key exists
     - Transactional: create `Permission` rows + `Secret` rows for each recipient
     - Write `ShareHistory` entries
   - `DELETE /resources/:id/share/:userId` — revoke access
     - Delete `Permission` + `Secret` rows for that user
   - `GET /resources/:id/permissions` — list all permissions (OWNER only)

2. **Frontend — Share dialog**
   - User picker: search org users by name/email
   - For each selected recipient: fetch their public key → decrypt secret locally → re-encrypt per recipient → submit
   - Permission level selector (READ / UPDATE)
   - Revoke button per recipient in permissions view

3. **E2E test:** Two-user share flow — user A shares with user B → user B can decrypt → revoke → user B loses access

---

### Phase 3: Milestone 5 — MFA + Admin

1. **Backend — MFA module** (`apps/api/src/mfa/`)
   - `POST /mfa/totp/enroll` — generate TOTP secret, return QR code URI
   - `POST /mfa/totp/verify` — verify 6-digit code, mark device verified
   - `DELETE /mfa/totp` — remove TOTP device
   - Modify login flow: if user has verified MFA device, return `mfaRequired: true` + temp session token
   - `POST /auth/mfa/verify` — verify code, upgrade temp session to full session

2. **Backend — Admin module** (`apps/api/src/admin/`)
   - `GET /admin/users` — list all users (ORG_ADMIN+ only)
   - `PUT /admin/users/:id/suspend` — set status to SUSPENDED
   - `PUT /admin/users/:id/activate` — set status to ACTIVE
   - `DELETE /admin/users/:id` — soft delete (status=DELETED)
   - Role guard: `@Roles(ORG_ADMIN, SUPER_ADMIN)` + `RolesGuard`

3. **Backend — Audit module** (`apps/api/src/audit/`)
   - Event emitter → `AuditService.log(orgId, userId, action, entityType, entityId, metadata)`
   - `GET /audit-logs` — paginated, filterable (admin only)
   - Wire audit events: login, register, resource create/update/delete, share, revoke

4. **Frontend**
   - `/settings/mfa` — TOTP enrollment flow (QR scan → verify → enabled)
   - `/admin/users` — user management table
   - `/admin/audit-logs` — audit log viewer with filters

5. **E2E test:** MFA-gated login works (enroll → logout → login → MFA prompt → verify → vault)

---

### Phase 4: Milestone 6 — Browser Extension

1. **Scaffold MV3 extension** (`apps/extension/`)
   - `manifest.json` with content scripts + background service worker
   - Shared `@clickrypt/crypto` dependency

2. **Features**
   - Unlock flow (passphrase → decrypt private key in extension memory)
   - Autofill: detect login forms → match by URI → fill username/password
   - Save-on-submit: detect new logins → prompt to save
   - Vault sync: fetch resources from API

3. **Exit criteria:** Autofill works on test login pages

---

### Phase 5: Milestone 7 — Team-ready

1. **Groups module** — CRUD, membership, group-share fan-out
2. **Nested folders** — enable `parentFolderId` recursion in UI
3. **CSV/Bitwarden import** — parse + bulk encrypt + create resources
4. **Favorites** — star/unstar resources
5. **Search polish** — debounced, highlight matches

---

### Phase 6: Milestone 8 — Enterprise

1. SSO (OIDC → SAML bridge)
2. SCIM user provisioning
3. Self-host Docker Compose package
4. Public API keys + CLI tool

---

## 8. Recommended Build Order (immediate next steps)

| Priority | Task | Est. effort |
|---|---|---|
| 1 | Install TanStack Query + shadcn/ui in web app | 1 session |
| 2 | Build backend `resources` + `permissions` modules + DTOs | 1-2 sessions |
| 3 | Build backend `folders` + `tags` modules | 1 session |
| 4 | Seed default resource type + write resources e2e test | 1 session |
| 5 | Rewrite `/vault` page with resource list, create dialog, reveal/copy | 2 sessions |
| 6 | Wire auto-lock improvements (beforeunload, visibility change) | 0.5 session |
| 7 | Backfill zxcvbn strength meter into register page | 0.5 session |
| 8 | Build share endpoint + share dialog (Milestone 4) | 2 sessions |
| 9 | Build MFA + admin + audit (Milestone 5) | 2-3 sessions |

---

## 6. Immediate open decisions

1. **Supabase vs. plain Postgres for dev/MVP** — plan assumes plain Postgres via Docker
   (Prisma keeps us portable either way; Supabase adds nothing for custom GPG auth).
2. **Argon2id in browser** — use `argon2-browser` (WASM); fallback question only if we
   must support very old browsers (we shouldn't).
3. **OpenPGP.js vs. libsodium** — OpenPGP.js for Passbolt-style interop (import/export of
   Passbolt recovery kits becomes feasible later).
4. **Recovery policy** — strict (no admin recovery) for MVP; revisit at Milestone 8.

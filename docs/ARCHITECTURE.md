# Architecture

SprintDeck Enterprise is a single-page application and an HTTP API deployed together as one
Azure Static Web App, backed by Azure Cosmos DB. There is no separate application server,
container orchestrator or message broker.

## 1. System context

```
                    ┌──────────────────────────────┐
   Browser ────────▶│  Azure Static Web Apps       │
   (React SPA)      │  sprintdeck.in               │
                    │                              │
                    │  ├─ static assets (Vite)     │
                    │  └─ /api/* → Functions (Node)│
                    └───────────┬──────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
     ┌────────────────┐ ┌───────────────┐ ┌─────────────────┐
     │ Azure Cosmos DB│ │ Azure Web     │ │ External APIs   │
     │ database:      │ │ PubSub        │ │ Google · Entra  │
     │ "sprintdeck"   │ │ (live rooms)  │ │ Resend · Linear │
     └────────────────┘ └───────────────┘ └─────────────────┘
```

Identity providers (Google, Microsoft Entra) are reached from the browser; their tokens are
verified server-side. Outbound mail goes through Resend or SendGrid. Linear integration uses
a key supplied by the customer.

## 2. Components

### Frontend — `src/`
React 18 + TypeScript, built by Vite (Rolldown). Routing is hand-rolled in `src/App.tsx`
against `window.location`; there is no router dependency. Route-level components are lazily
imported so the initial bundle carries only the shell and the React runtime, which is split
into its own long-cached chunk (`vite.config.ts`).

Key modules:

| Module | Responsibility |
|---|---|
| `src/lib/auth.ts` | Sign-in (password and OAuth), token storage, session state |
| `src/lib/subscription.ts` | Plan state and tier definitions |
| `src/lib/verifier.ts` | Calls the payment and subscription endpoints |
| `src/lib/storage.ts` | Per-room identity kept in browser storage |
| `src/lib/chat.ts` | Web PubSub client for live rooms |

### API — `api/`
Azure Functions, Node 20, CommonJS, v4 programming model. Every file matching
`api/src/functions/*.js` is loaded at start; each registers its routes with `app.http(...)`.

| Module | Responsibility |
|---|---|
| `functions/auth.js` | Register, log in, OAuth exchange, profile, password reset, GDPR export/delete |
| `functions/poker.js` | Planning-poker sessions, voting, queue, Linear import/push |
| `functions/retro.js` | Retrospective boards |
| `functions/whiteboard.js` | Whiteboard documents, presence, share links |
| `functions/chat.js`, `negotiate.js` | In-room chat and Web PubSub negotiation |
| `functions/payments.js` | Orders, UPI credit ingest, subscription status |
| `functions/startup.js` | Applies pending Cosmos migrations on cold start |
| `users-store.js` | Accounts, names, plans |
| `payments-store.js` | Orders and receipts |
| `retroStore.js`, `whiteboardStore.js`, `store.js` | Ceremony state |
| `jwt.js` | HS256 sign/verify, no dependency |
| `email.js` | Resend / SendGrid sender |
| `oauth.js` | Google and Microsoft token verification (JWKS) |
| `ratelimit.js` | Per-route request throttling |
| `migrations/` | Ordered schema/data migrations and their ledger |

Every store degrades to an in-process `Map` when `COSMOS_CONNECTION_STRING` is absent, which
is what makes local development work without a database. **That fallback is per-instance and
non-durable; it is a development convenience, never a production mode.**

## 3. Authentication

Three ways in, one token format.

```
Password ──▶ scrypt verify ──┐
Google   ──▶ id_token ──┐    │
Microsoft ─▶ id_token ──┴─▶ JWKS verify ─┴─▶ HS256 JWT (JWT_SECRET)
                                              │
                          sub = account id ───┘  email = address
```

**Accounts are scoped to the provider that authenticated them.** The same address signed in
through two providers is two accounts:

```
google:you@example.com        Google sign-in
microsoft:you@example.com     Microsoft sign-in
you@example.com               password account
```

The account id is the Cosmos document id and travels in the JWT `sub` claim. Requests resolve
the caller from `sub`, falling back to `email` for tokens issued before accounts were split.

OAuth uses the implicit `id_token` flow: the provider redirects a popup to
`/auth/{provider}/callback`, which hands the token to the opener through `postMessage` **and**
`localStorage`, because returning from a cross-origin page can place the popup in a new
browsing-context group where `window.opener` is null. Those two callback paths are served with
`Cross-Origin-Opener-Policy: unsafe-none` for the same reason; every other path keeps
`same-origin-allow-popups`.

> The implicit flow is legacy. Authorization code + PKCE is the intended destination — see
> [SCOPE.md](SCOPE.md#planned).

## 4. Entitlement

A plan is four fields on the account document — `tier`, `lifetime`, `planGrantedAt`,
`planExpiresAt`. `GET /api/subscription` reads them for the caller's account; an expired
`planExpiresAt` reports `free`. Orders exist to record purchases, not to confer access.

Payment is UPI without a payment gateway: an order reserves a unique paise amount, and a bank
credit notification posted to the ingest endpoint is matched against pending orders by that
amount. A confirmed match writes the purchased tier onto the buying account.

## 5. Real-time

Rooms hold state in Cosmos and broadcast through Azure Web PubSub. Clients obtain a connection
through `/api/negotiate`. Where Web PubSub is not configured, the UI falls back to polling.

## 6. Deployment

```
push to main ─▶ GitHub Actions ─▶ npm ci && npm run build ─▶ Azure Static Web Apps
                                   (VITE_* injected here)      ├─ dist/  → CDN
                                                               └─ api/   → Functions
```

`VITE_*` values are compiled into the bundle **at build time**, so a change to those secrets
requires a rebuild, not just a restart. Server-side settings are read per request from Azure
application settings and take effect immediately.

The workflow deploys `dist/` directly (`skip_app_build: true`) rather than letting the platform
build, so the build failing is visible in Actions instead of producing a broken deployment.

## 7. Decisions worth knowing

| Decision | Why |
|---|---|
| One Cosmos container (`users`) for accounts, orders, receipts and name reservations | Cheaper on a shared-throughput account and keeps related writes together; documents are separated by a `type` field and id prefix |
| Accounts scoped per provider | A plan bought through one identity should not follow another; chosen deliberately over account linking |
| Entitlement on the account, not derived from orders | One place to read, one place to edit, and no query across a purchase history to answer "what plan is this?" |
| No payment gateway | UPI direct transfer avoids per-transaction fees; the cost is manual reconciliation logic |
| Hand-rolled JWT and routing | Two fewer dependencies to track and patch in a small codebase |

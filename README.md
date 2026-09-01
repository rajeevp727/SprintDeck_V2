# SprintDeck Enterprise Edition (V2)

SprintDeck V2 is a **real-time agile-ceremonies hub** for distributed teams. It runs
planning poker, retrospectives, and whiteboards — and, on the **Paid** plans, connects to
your project-management tool (Linear, Jira, Azure DevOps) to pull estimation tickets and
**write the agreed story points back** after voting. Email/password or SSO is required
to create or join any room; connecting a tool uses your own API key.

- **Live:** `https://sprintdeck.in`
- **SWA:** `https://green-desert-0f2350910.7.azurestaticapps.net/`
- **Repo:** `rajeevp727/SprintDeck_V2` · branch `main` auto-deploys on push

> **Note on integrations:** Linear is the only **live** tool integration (real
> read/write via a server-side workspace API key). Jira and Azure DevOps are in the
> picker as **preview** — the provider adapter is scaffolded but the key is not yet
> sent to the server. See `PRD.md` (T1/T10) and `CHANGELOG.md`.

## Quick start (local dev)

V2 runs on its own ports so it can coexist with V1: web **5273**, API **7072**.

```bash
npm install && npm --prefix api install
npm run dev:all          # starts web (vite :5273) + API (func :7072)
```

- The API falls back to an in-memory store locally; set `COSMOS_CONNECTION_STRING` in
  `api/local.settings.json` for persistent storage.
- `npm run build` — typecheck + Vite build (`tsc -b && vite build`).
- `npm test` — vitest unit tests. `npm run lint` — ESLint.
- **Gotcha:** `npm run build` runs `tsc -b`, which emits `vite.config.js` /
  `*.tsbuildinfo` (gitignored). If one appears, delete it before `dev:all` or Vite may
  pick up the compiled JS instead of `vite.config.ts`.

## Stack

| Layer        | Tech                                                      |
|---|---|
| Frontend     | React 18 + TypeScript + Vite 5                              |
| API          | Azure Functions (Node 20), served at `/api` by Static Web Apps |
| Database     | Azure Cosmos DB (NoSQL, serverless) + in-memory fallback  |
| Realtime     | Short polling every 1.5s (everywhere) + Azure Web PubSub (chat & retrospectives) |
| Auth         | Email/password + Google/Microsoft SSO, JWT in `x-auth-token` header *(SWA strips `Authorization`)* |
| Payments     | PhonePe UPI (QR + bank-email auto-ingest via Google Apps Script) — no PSP |
| Ads          | Google AdSense (publisher ID is public; slot ID pending approval) |
| Deploy       | Azure Static Web Apps (Free tier)                           |
| Testing      | Vitest (unit) + GitHub Actions CI                           |

## Ceremonies

SprintDeck V2 hosts four ceremony types from a single app:

| Ceremony | URL path | Description |
|---|---|---|
| **Planning Poker** | `/` | Create a room, invite the team by code/link, vote on stories with hidden Fibonacci cards, reveal & reach consensus. |
| **Retrospective** | `/retro/NEW` or `/retro/CODE` | Miro-style board: review last sprint's action items, then add notes in columns. Export to `.txt`/`.csv`/`.pdf`. **Pro+**. |
| **Whiteboard** | `/whiteboard` | Freeform canvas — pen, shapes, arrows, sticky notes, text. Undo/redo. **Pro+**. |
| **Daily Scrum & Timesheet** | `/timesheet` | Self-contained weekly standup + timesheet capture; copy to Keka or download CSV/JSON. No backend. |

Routing is a hand-rolled SPA router in `App.tsx` (no `react-router`). Room codes are
kept in `localStorage`, not the URL — invite links use `?room=CODE` and the code is
stripped from the address bar on load. Retrospective and whiteboard boards carry their
code in the URL so a facilitator can share a plain link.

### Planning Poker flow

1. Moderator creates a room (5-char code); teammates join by code or invite link — account required.
2. Moderator clicks **Connect a project management tool** (Linear / Jira / Azure DevOps)
   → pastes a read/write API key → pulls the tool's estimation view into the queue.
   **Or** add tasks manually (one per line).
3. Team votes on each story (hidden until reveal).
4. On reveal, the moderator confirms the agreed value → it's **pushed back** to the ticket.
5. Estimated stories grey out with their points; the Results modal shows per-round stats
   and session-level analytics, plus `.txt`/`.csv`/`.json` export.

### Subscriptions & payments (PSP-free UPI)

Tiers: **Free** (V1 — plain poker) · **Pro** ₹199/month · **Expert** ₹499/month (Popular) ·
**Master** ₹999/month. A flat **₹2 platform fee** is added to every paid transaction.

**Pro+** unlocks: team chat, retrospectives, whiteboards. The subscription check is
**server-side only** — the browser stores just the confirmed order's ID; the tier is
fetched from `/api/subscription`, which validates it against the payment record in Cosmos.

Payment flow (no payment gateway):

```
Pick a plan → POST /api/order (amount validated server-side) → order stored in Cosmos
  → client shows a UPI QR (built client-side from the VITE_UPI_ID build secret)
  → user scans & pays via any UPI app
  → bank sends a "credited" email/SMS → Google Apps Script posts it to /api/upi/ingest
  → backend parses amount + UTR, matches the most-recent pending order → confirmed
  → client polls /api/upi/status (survives modal close & page reload via a
     persistent pending-order watcher) → plan activates
```

- Matching is by **exact amount**; duplicate UTRs are de-duped.
- Only **credit** alerts confirm (debits are ignored).
- Confirmation latency is bank-email-bound (~seconds to a minute). See
  `integrations/gmail-ingest.gs` and `public/Documentation/SprintDeck-V2.md`.

## Project structure

```
├── index.html              # Vite entry (loads AdSense script)
├── package.json            # Web deps + scripts
├── vite.config.ts          # Vite + SWA proxy (:5273 → :7072)
├── tsconfig.json           # strict TS, noUnusedLocals, isolatedModules
├── tsconfig.node.json      # composite config for tsc -b (vite.config.ts)
├── eslint.config.js        # flat config, react-hooks rules
├── staticwebapp.config.json  # routes, security headers, CSP, apiRuntime node:20
├── PRD.md                  # product requirements + roadmap (T1–T10)
├── CHANGELOG.md            # dated change log
├── CONTEXT.md              # project index / architecture reference
├── README.md               # you are here
│
├── src/
│   ├── main.tsx            # React mount (StrictMode + ErrorBoundary)
│   ├── App.tsx             # SPA router — all routes, top-level subscription watcher
│   ├── styles.css          # full theme system (dark/light/lite) + components
│   ├── vite-env.d.ts       # VITE env typings
│   │
│   ├── components/         # 28 React components (lazy-loaded heavy modals)
│   │   ├── Room.tsx          # planning poker room (polling, voting, Linear push)
│   │   ├── RetroBoard.tsx    # retrospective board (realtime via Web PubSub fallback)
│   │   ├── RetroStart.tsx    # retro create/join form
│   │   ├── RetroHome.tsx     # retro join (auto-joins poker-room identity)
│   │   ├── RetroNote.tsx     # editable sticky note
│   │   ├── Whiteboard.tsx    # canvas with pen/shapes/stickies (local state)
│   │   ├── Dashboard.tsx     # signed-in home (ceremony picker)
│   │   ├── Landing.tsx       # public marketing page (sign in)
│   │   ├── Home.tsx          # create/join room form
│   │   ├── AuthScreen.tsx    # email/password login/register with live name check
│   │   ├── ProfileMenu.tsx   # account dropdown (change password, sign out)
│   │   ├── ResultsModal.tsx  # estimation results + analytics + export
│   │   ├── ChatPanel.tsx     # team chat (PRO+) — likes, replies, typing
│   │   ├── SubscriptionModal.tsx  # plan picker + UPI QR + payment polling
│   │   ├── ConnectToolModal.tsx    # Linear/Jira/ADO picker
│   │   ├── ToolConnectModal.tsx    # per-tool API key entry
│   │   ├── ThemeToggle.tsx     # light/dark toggle (SVG sun/moon)
│   │   ├── StickyAd.tsx        # dismissible footer ad
│   │   ├── AdBanner.tsx        # AdSense ad unit
│   │   ├── Toast.tsx           # toast notifications (global event bus)
│   │   ├── ErrorBoundary.tsx     # crash → reload prompt
│   │   ├── ChangePasswordModal.tsx
│   │   ├── Privacy.tsx / Terms.tsx / Security.tsx  # legal pages
│   │   ├── BrandLogo.tsx / LinearLogo.tsx  # SVG logos
│   │   └── icons.tsx           # shared modal control SVGs (close/back/info/crown)
│   │
│   └── lib/                # core logic (22 modules)
│       ├── api.ts            # HTTP client — all REST endpoints via request()
│       ├── types.ts          # shared TS types (Session, Participant, QueueItem, …)
│       ├── storage.ts        # localStorage identity + current-room helpers
│       ├── auth.ts            # email/password client (JWT in x-auth-token)
│       ├── theme.ts           # system/light/dark theme handling
│       ├── estimate.ts        # Fibonacci deck + nearest-value snap logic
│       ├── estimate.test.ts
│       ├── subscription.ts    # tiers + localStorage order-ref + UPI link builder
│       ├── verifier.ts        # UPI order/status/subscription client
│       ├── realtime.ts        # useRealtime() Web PubSub hook
│       ├── presence.ts        # join/leave toast notifications
│       ├── chat.ts            # Web PubSub chat connection helper
│       ├── analytics.ts       # session estimation analytics (consensus, spread…)
│       ├── analytics.test.ts
│       ├── telemetry.ts       # client errors → /api/log → App Insights
│       ├── perf.ts            # low-end device detection (data-perf="lite")
│       ├── export.ts          # session export (.txt/.csv/.json)
│       ├── retroApi.ts        # retrospective REST client
│       ├── retroTypes.ts      # retro board types
│       ├── retroExport.ts     # retro export (.txt/.csv/pdf)
│       ├── whiteboardApi.ts   # whiteboard REST client
│       ├── whiteboardTypes.ts # whiteboard types
│       ├── adsConfig.ts       # AdSense publisher/slot config
│       └── rememberedAccounts.ts # Instagram-style account suggestions
│
├── api/                    # Azure Functions backend (Node, @azure/functions v4)
│   ├── host.json           # App Insights sampling, node workerRuntime
│   ├── package.json        # @azure/cosmos, @azure/functions, @azure/web-pubsub
│   ├── local.settings.json # (gitignored) local dev settings
│   └── src/
│       ├── functions/
│       │       ├── poker.js      # session CRUD, voting, queue, Linear, health, log
│       │   ├── retro.js      # retrospective board CRUD (PRO+ gated)
│       │   ├── whiteboard.js # whiteboard CRUD (PRO+ gated)
│       │   ├── chat.js       # team chat — Web PubSub + message persistence (PRO+)
│       │   ├── negotiate.js  # Web PubSub negotiation (retro only, member-verified)
│       │   ├── auth.js       # register/login/me/check-name/forgot-reset-password
│       │   └── payments.js   # order creation, UPI ingest, subscription, status
│       ├── store.js          # in-memory/Cosmos session store (poker)
│       ├── store.test.mjs
│       ├── retroStore.js     # retrospective board + action-items ledger store
│       ├── whiteboardStore.js # whiteboard element store
│       ├── users-store.js    # email/password users (scrypt, Cosmos)
│       ├── payments-store.js # UPI orders + receipts (Cosmos, amount-matched)
│       ├── linear.js         # Linear GraphQL provider (resolve/setEstimate/mock)
│       ├── jwt.js            # minimal HS256 JWT (sign/verify, timing-safe)
│       ├── parse.js          # bank credit-alert parser (amount/UTR)
│       ├── ratelimit.js      # in-memory per-IP rate limiter
│       └── realtime.js       # Web PubSub service client (notifyGroup/negotiate)
│
├── index.html                  # Vite entry (at repo root)
├── integrations/
│   ├── README.md               # Gmail ingest setup instructions
│   └── gmail-ingest.gs         # Google Apps Script → /api/upi/ingest bridge
└── public/
    ├── logo.svg / logo-mark.svg   # brand assets
    ├── favicon.svg / favicon.png / apple-touch-icon.png
    ├── ads.txt                 # AdSense site verification
    └── Documentation/
        └── SprintDeck-V2.md   # technical deep-dive (payments, config)
```

## Architecture

### Routing (`src/App.tsx`)

A hand-rolled SPA router — no `react-router`. The route is a discriminated union:

```
home | room | retro | retroJoin | retroStart | whiteboard |
timesheet | auth | plan | privacy | terms | security
```

- Room codes are kept in `localStorage` (`pp.identity` map + `pp.currentRoom`),
  not the URL. Invite links carry `?room=CODE`, which is read on open and then
  stripped from the address bar.
- Retrospective boards keep the code in the URL (`/retro/CODE`) so a facilitator can
  share a plain link. The `/` router maps it to `retro` or `retroJoin` depending on
  whether the visitor already has an identity for that board.

### Data flow & sync

- The poker room polls `GET /api/session/{code}` every **1.5s**. Polling pauses when
  `document.hidden` (tab backgrounded) and resumes on `visibilitychange`.
- **6 consecutive** "not found" polls are tolerated before a client leaves a room —
  this rides out transient misses (tab throttling, cold starts, instance splits).
- **Chat** (Pro+) and **retrospectives** use Azure Web PubSub for real-time push
  (`{ t: 'changed' }` on every mutation triggers an immediate refresh on clients).
  The `/api/negotiate` endpoint verifies board membership before issuing a client
  access URL, so only actual participants get a token. If Web PubSub isn't configured
  (`WEBPUBSUB_CONNECTION_STRING` unset), clients transparently fall back to polling.
- Team chat persists messages server-side and broadcasts live via the room's Web PubSub
  group. Likes and replies are supported; the moderator cannot read or post (members-only
  back-channel).
- All API requests go through `src/lib/api.ts` → `request()`, which attaches the JWT
  (when present) as `x-auth-token` — a custom header, because Azure Static Web Apps
  strips the `Authorization` header before forwarding to the Functions API.
- All responses carry `Cache-Control: no-store` to prevent stale-state caching.

### Identity

- **Email/password auth** is mandatory for all room and module access (planning poker,
  retrospectives, whiteboards, timesheet). Users register/login with email + password or
  sign in with **Google / Microsoft SSO**. JWT is HS256 (`JWT_SECRET`), short-lived
  (1 day) or "remember me" (28 days). `auth.ts` degrades cleanly to 503 if `JWT_SECRET`
  isn't set.
- **Google + Microsoft SSO** via OAuth 2.0. The frontend opens a popup, the provider
  redirects back with an `id_token`, and the backend verifies it and issues its own JWT.
  Redirect URIs are configured per environment (`localhost`, `sprintdeck.in`, Azure SWA).
- Password reset emails are sent via SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) when
  configured; otherwise the reset link is logged to the server console (dev mode).
- Per-room identity (`pp.identity`) is stored in `localStorage` so a refresh rejoins
  seamlessly. Identity is per-room, not global.

### Subscription gating

- Tiers: **Free** (V1 link) · **Pro** ₹199 · **Expert** ₹499 · **Master** ₹999 (per month).
- Pro+ features (chat, retrospectives, whiteboards) are gated **server-side**: the
  client stores only the confirmed order ID; `/api/subscription` validates the tier
  against the payment record in Cosmos. Editing `localStorage` can't grant a plan.
- Activation is manual (UPI has no auto-confirmation). A background watcher in
  `App.tsx` polls the order status every 15s — it survives the QR window elapsing and
  page reloads, activating the plan whenever the bank email lands.

## API reference

The API is a set of HTTP-triggered Azure Functions served same-origin under `/api`.

### Planning Poker (`/api/session`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/session` | Create room `{ name, moderatorName?, code? }` (rate-limited) |
| POST | `/api/session/{code}/join` | Join `{ name }` |
| GET  | `/api/session/{code}?participantId=` | Poll room state |
| POST | `/api/session/{code}/vote` | `{ participantId, vote }` (null to clear) |
| POST | `/api/session/{code}/start` | *(moderator)* Start a voting round |
| POST | `/api/session/{code}/reveal` | *(moderator)* Reveal votes, save to history |
| POST | `/api/session/{code}/reset` | *(moderator)* Clear votes, vote again |
| POST | `/api/session/{code}/queue` | *(moderator)* Add stories `{ stories }` |
| DELETE | `/api/session/{code}/queue/{storyId}` | *(moderator)* Remove from queue |
| POST | `/api/session/{code}/queue/reorder` | *(moderator)* Reorder queue `{ order }` |
| POST | `/api/session/{code}/next` | *(moderator)* Advance to next queued story |
| POST | `/api/session/{code}/finish` | *(moderator)* Mark finished (unlock results) |
| POST | `/api/session/{code}/kick` | *(moderator)* Kick a participant |
| POST | `/api/session/{code}/end` | *(moderator)* End & delete the room |
| POST | `/api/session/{code}/retro` | *(moderator)* Link a retro board `{ retroCode }` |
| POST | `/api/session/{code}/linear/import` | *(moderator)* Resolve ticket IDs → queue |
| POST | `/api/session/{code}/linear/import-estimation` | *(moderator)* Load estimation-view tickets (mock) |
| POST | `/api/session/{code}/linear/push` | *(moderator)* Write agreed estimate back to Linear |
| GET  | `/api/linear/status` | Is a Linear API key configured server-side? |
| POST | `/api/session/{code}/chat/enable` | *(moderator, Pro+)* Unlock team chat |
| POST | `/api/session/{code}/chat/negotiate` | Get a Web PubSub access URL for chat |
| GET  | `/api/session/{code}/chat/messages` | Chat history |
| POST | `/api/session/{code}/chat/message` | Send a chat message |
| POST | `/api/session/{code}/chat/like` | Toggle a like on a chat message |

### Retrospective (`/api/retro`) — Pro+

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/retro` | Create board (Pro+ verified via `subRef`) |
| POST | `/api/retro/{code}/join` | Join board `{ name }` |
| GET  | `/api/retro/{code}?participantId=` | Poll board state |
| POST | `/api/retro/{code}/note` | Add a note `{ columnId, text }` |
| POST | `/api/retro/{code}/note/{noteId}` | Edit a note (author only) |
| DELETE | `/api/retro/{code}/note/{noteId}` | Delete a note (author or facilitator) |
| POST | `/api/retro/{code}/review/{itemId}` | *(facilitator)* Tick off a carry-over action item |
| POST | `/api/retro/{code}/open` | *(facilitator)* Open the board (end review phase) |
| POST | `/api/retro/{code}/leave` | Member leaves |
| POST | `/api/retro/{code}/end` | *(facilitator)* Finalize — read-only + export unlocked |

### Whiteboard (`/api/whiteboard`) — Pro+

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/whiteboard` | Create (Pro+ verified via `subRef`) |
| POST | `/api/whiteboard/{code}/join` | Join |
| GET  | `/api/whiteboard/{code}?participantId=` | Poll state |
| POST | `/api/whiteboard/{code}/element` | Add an element |
| POST | `/api/whiteboard/{code}/element/{id}` | Update an element (author or facilitator) |
| DELETE | `/api/whiteboard/{code}/element/{id}` | Delete an element (author or facilitator) |
| POST | `/api/whiteboard/{code}/clear` | *(facilitator)* Clear all elements |
| POST | `/api/whiteboard/{code}/end` | *(facilitator)* End (read-only) |

### Auth (`/api/auth`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register `{ email, password, name, remember? }` |
| POST | `/api/auth/login` | Login `{ email, password, remember? }` |
| GET  | `/api/auth/me` | Current user (header `x-auth-token`) |
| GET  | `/api/auth/check-name?name=` | Name availability + suggestions |
| POST | `/api/auth/password` | Change password (header `x-auth-token`) |
| POST | `/api/auth/forgot-password` | Send reset email (logs link to server) |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` |

### Payments & subscriptions

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/order` | Create a pending UPI order `{ tier, baseAmount }` → `{ orderId, payAmount }` |
| POST | `/api/upi/ingest` | Ingest a bank credit alert (header `x-ingest-secret`) → match by amount |
| GET  | `/api/upi/status?orderId=` | `pending` / `confirmed` / `expired` |
| GET  | `/api/subscription?orderId=` | Server-verified subscription `{ active, tier?, at? }` |
| GET  | `/api/linear/status` | Linear API key configured? |
| GET  | `/api/chat/status` | Web PubSub configured for chat? |
| GET  | `/api/negotiate?group=retro:CODE&participantId=` | Web PubSub group access URL |
| POST | `/api/log` | Client error sink → Application Insights |
| GET  | `/api/health` | Warm-keep / uptime ping |

### Real-time sync

- `/api/negotiate` (chat) and `/api/negotiate?group=retro:CODE` (retro) issue Azure Web
  PubSub client access URLs scoped to the room/board group. The retro negotiate endpoint
  verifies board membership first — a non-member gets `{ url: null }` and falls back to
  polling. On every board mutation, `retroStore.js` calls `realtime.notifyGroup()` which
  pushes a `{ t: 'changed' }` ping to all group members.

## Configuration

### Frontend env vars (injected at build via GitHub Actions workflow)

| Variable | Purpose |
|---|---|
| `VITE_UPI_ID` | Payee UPI VPA for the QR (from GitHub secret `UPI_ID`) |
| `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING` | Not currently wired in frontend — telemetry logs client-side errors to `/api/log` (App Insights is backend-only) |
| `VITE_SENTRY_DSN` | *(optional, future)* — set to enable Sentry alongside App Insights |

> A `.env.local` file with `VITE_UPI_ID=...` is used for local development.

### Azure backend app settings

| Setting | Purpose | Default |
|---|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB — required in prod for persistence | in-memory fallback |
| `WEBPUBSUB_CONNECTION_STRING` | Enables real-time chat & retro sync | polling fallback |
| `LINEAR_API_KEY` | Server-side Linear workspace API key | Linear disabled |
| `JWT_SECRET` | JWT signing/verification (auth feature) | auth returns 503 |
| `INGEST_SECRET` | Guards `POST /api/upi/ingest` (matches the Apps Script) | ingest 503 |
| `SESSION_IDLE_HOURS` | Room idle TTL | 2 |
| `SESSION_MAX_AGE_HOURS` | Room max age | 24 |
| `ORDER_TTL_MINUTES` | Pending UPI order expiry before auto-cancel | 30 |

## Payments & retention

- **Retention:** rooms auto-expire after idle/max windows (`SESSION_IDLE_HOURS` /
  `SESSION_MAX_AGE_HOURS`); Cosmos native TTL enforces idle expiry server-side. Polling
  reads refresh the idle timer (throttled to 5 min) so an open room never ages out while
  someone's viewing it. Retrospective and whiteboard boards use the same pattern with
  4h idle / 8h max limits.
- **Export:** the Results modal exports a session as **`.txt`, `.csv`, or `.json`**
  (full round data). Retrospectives export to **`.txt`, `.csv`, or `.pdf`** (browser print).
- **Delete on request:** the moderator's **End room** deletes the room immediately;
  retrospective/end also unlink from the parent poker room and carry action items
  forward.
- **Backups:** enable Azure Cosmos DB periodic or continuous backup on the `sprintdeck`
  account (an Azure-side setting, not app code).
- **UPI auto-ingest:** `integrations/gmail-ingest.gs` polls Gmail for "credited"
  alerts every ~10s and POSTs them to `/api/upi/ingest`. Debit alerts are ignored.
  UTRs are de-duped server-side. Setup instructions in `integrations/README.md`.

## Observability

- **Error tracking:** uncaught client errors (and the React ErrorBoundary) are POSTed to
  `POST /api/log`, which logs them to Azure Application Insights (enabled in
  `api/host.json`). `src/lib/telemetry.ts` is the single place to add Sentry
  (set `VITE_SENTRY_DSN`). Uses `keepalive` so errors still report during unload.
- The `/api/log` endpoint is rate-limited per-IP and message-capped to prevent abuse.

## Security

- **Headers** (`staticwebapp.config.json`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation
  disabled), `Cross-Origin-Opener-Policy: same-origin`, and a restrictive
  **Content-Security-Policy** (scripts/styles from `self` + Google AdSense domains;
  `connect-src` includes `*.webpubsub.azure.com`).
- **Rate limiting:** per-IP, in-memory, applied to low-frequency writes (room creation,
  order creation, chat messages, retro board creation, negotiate) — never to the 1.5s
  poll or voting (which would false-positive for a team behind one NAT).
- **Credentials:** the Linear API key, JWT secret, and UPI ingest secret are server-side
  app settings only — never exposed to other clients or the browser.
- **Passwords:** scrypt-hashed + per-user salt in Cosmos (or in-memory); verified in
  constant time. Login returns the same error for a bad email or bad password (no
  user enumeration).
- **Dependabot:** configured for npm (`/`, `/api`) and GitHub Actions (weekly).

## Testing

```bash
npm test          # vitest run — 14 unit tests
npm run lint      # eslint .
```

| Suite | File(s) | Covers |
|---|---|---|
| `src/lib/estimate.test.ts` | `nearestDeckValue` | median → deck snap |
| `src/lib/analytics.test.ts` | `sessionAnalytics` | totals, consensus, spread, distribution |
| `api/src/store.test.mjs` | `store.js` | Linear queue, reveal/markPushed, reorder |
| `api/src/linear.test.mjs` | `linear.js` | mock tickets, isMockId, resolveIssues (mocked fetch) |

CI: `.github/workflows/test.yml` runs `npm install && npm test` on push/PR to `main`.

## Local development notes

- `npm run dev:all` runs web (`:5273`) and API (`:7072`) concurrently. The Vite dev
  server proxies `/api` to the Functions host.
- `npm run dev:lan` is the same but with `vite --host` (for LAN testing on a phone).
- To use Cosmos locally, add `COSMOS_CONNECTION_STRING` to `api/local.settings.json`
  (gitignored — never commit it).
- The whiteboard and retro features are PRO+ — to test them locally without paying,
  temporarily comment out the `payments.activeSubscription(subRef)` check in
  `api/src/functions/retro.js` and `whiteboard.js`, or set a `subRef` whose order is
  "confirmed" in the in-memory store.

## Deploy

- Azure Static Web App **`SprintDeck-Enterprise`** (Free tier) on
  `https://green-desert-0f2350910.7.azurestaticapps.net/` and custom domain `https://sprintdeck.in`.
- Repo `rajeevp727/SprintDeck_V2`, branch `main` → auto-deploys via
  `.github/workflows/azure-static-web-apps-green-desert-0f2350910.yml`.
- Build config: App `/`, API `api`, Output `dist`.
- The workflow injects `secrets.UPI_ID` → `VITE_UPI_ID` at build time.
- Custom domain: CNAME to the SWA default domain.

## Docs & references

- **`PRD.md`** — product vision, positioning, scope, tiers, roadmap (T1–T10).
- **`CHANGELOG.md`** — dated log of changes (newest first).
- **`CONTEXT.md`** — project index: structure, architecture, conventions.
- **`public/Documentation/SprintDeck-V2.md`** — technical deep-dive (payments flow,
  config, deploy, limitations).
- **`integrations/README.md`** — Gmail ingest setup.

## Conventions

- **No comments** unless explicitly requested (the existing files are heavily commented
  for context — preserve that style).
- Components are **PascalCase**; hooks use the `use` prefix; modules are **camelCase**.
- Heavy modals (`ResultsModal`, `ToolConnectModal`, `SubscriptionModal`, `ChatPanel`,
  `ChangePasswordModal`) are lazy-loaded via `React.lazy` + `Suspense`.
- `Cache-Control: no-store` on all API responses to prevent stale polling state.
- The Linear workspace in mock data is `trivinna` — update in `api/src/linear.js` and
  `src/components/Room.tsx` if needed.

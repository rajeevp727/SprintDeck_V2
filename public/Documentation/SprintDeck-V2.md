# SprintDeck V2 (Enterprise) — Documentation

_Maintained with Claude. Last updated: 2026-07-07._

SprintDeck V2 is the **paid, integrations-hub** edition of SprintDeck — planning-poker
estimation that connects to your project-management tool, pulls the tickets to estimate, and
writes the agreed story points back. Live at **https://sprintdeckv2.rajeevstech.in**.

> V1 (free, plain planning poker) is a separate app at **https://sprintdeck.rajeevstech.in**.

---

## 1. Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Azure Functions (Node v4) — served same-origin under `/api` |
| Storage | Azure Cosmos DB (NoSQL, serverless) with an in-memory fallback |
| Hosting | Azure **Static Web App** `SprintDeck-Enterprise` (auto-deploys `main` on push) |
| Sync | Short-polling every 1.5s (no WebSockets); polling pauses when the tab is hidden |

**Repo:** `rajeevp727/SprintDeck_V2` (private). Push to `main` → GitHub Actions builds and
deploys the SWA (frontend + `api/`) in ~2–4 min.

**Conventions:** **camelCase** for all identifiers (frontend + backend). The only
UPPER_SNAKE names are `process.env` keys (external contracts). CSS is kebab-case.

---

## 2. Core app

- **Rooms** — a moderator creates a room (5-char code); teammates join by code/link. No login
  (anonymous). Moderator = room creator.
- **Estimation** — connect a project-management tool (Linear / Jira / Azure DevOps — Linear
  live, others planned) or add tasks manually; vote each ticket (hidden until reveal); on
  reveal the moderator confirms the agreed value and it's pushed back to the ticket.
- **Results** — per-round stats (average / median / consensus / spread) + session analytics;
  export as .txt / .csv / .json.
- **Theme** — light/dark with system default.

---

## 3. Subscriptions & payments (PSP-free UPI)

### Tiers
| Plan | Price/mo | Icon |
|---|---|---|
| Free | ₹0 (→ V1) | ♠ |
| Pro | ₹199 | 🚀 |
| Expert | ₹499 (Popular) | ⚡ |
| Master | ₹999 | 💎 |

A **₹2 platform fee** is added to every paid transaction (Free excluded). The info icon (ⓘ)
next to the amount shows the breakdown, e.g. `₹199 plan + ₹2 platform fee = ₹201`.

### Prorated upgrades
Upgrading mid-subscription charges only the **balance**: e.g. Pro→Expert = `499 − 199 + 2 =
₹302`. Subscriptions are active for **30 days**, then lapse (the plan popup returns for
renewal). Subscription state lives in browser `localStorage` (`sprintdeck.subscription`) —
device/browser-local, since there's no auth.

### Payment flow (no payment gateway)
```
Pick a plan → POST /api/order (amount validated) → order stored (Cosmos)
   → client shows a UPI QR (built client-side from the VITE_UPI_ID build secret)
   → user pays via any UPI app
   → bank emails a "credited" alert to Gmail
   → Gmail Apps Script (every ~10s) POSTs it to /api/upi/ingest (x-ingest-secret)
   → backend parses amount + UTR, matches the most-recent pending order → confirmed
   → client polls /api/upi/status → flips to ✓ (survives modal close/reload via a
     persistent pending-order watcher)
```
- Matching is by **exact amount** (most-recent pending order of that amount wins).
- Only **credit** alerts confirm (debits ignored); duplicate UTRs are de-duped.
- No sub-second confirmation is possible PSP-free (bank email delay); a real gateway
  (Razorpay/PhonePe PG) would add an instant signed webhook + show the merchant name.

### API endpoints (`api/`)
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/order` | Create a pending order → `{ orderId, payAmount }` |
| `POST` | `/api/upi/ingest` | Ingest a bank alert (header `x-ingest-secret`) → match |
| `GET` | `/api/upi/status?orderId=` | `pending` / `confirmed` / `expired` |
| — | `/api/session/*`, `/api/linear/*`, `/api/health`, `/api/log` | Rooms, Linear, ops |

### Configuration (Azure SWA → Application settings — NOT GitHub secrets)
| Setting | Purpose |
|---|---|
| `UPI_VPA` | payee VPA (also `VITE_UPI_ID` GitHub secret → frontend build for the QR) |
| `INGEST_SECRET` | guards `/api/upi/ingest` (must match the Apps Script) |
| `COSMOS_CONNECTION_STRING` | persistence (required in prod so order + ingest share state) |
| `PAYEE_NAME`, `ORDER_TTL_MINUTES` | optional |

### Gmail auto-ingest
`integrations/gmail-ingest.gs` — a Google Apps Script (runs in the receiving Gmail account)
that reads credit-alert emails and POSTs them to `/api/upi/ingest` every ~10s (a 1-min
time-trigger that re-checks internally). Dedups per message. See that file's header for setup.

---

## 4. Payment UI details

- Popup shows on every moderator login when not subscribed (zoom-in, 2s after entry).
- Header shows the crown **Upgrade** button, or the current plan's icon+name when subscribed
  (tap to change/upgrade).
- Pay screen order: plan · subtext · VPA · QR · countdown (1:30, colour-coded) · amount ⓘ · hint.
- QR loading shows a spinning ring (~1.5s) then the QR; on expiry it shows "regenerating…"
  for 5s then auto-creates a fresh QR.

---

## 5. Deploy & verify

- Push to `main` → SWA auto-builds/deploys (no manual `func publish`).
- Verify live: the served bundle hash at the site root changes when a new build lands
  (`curl -s https://sprintdeckv2.rajeevstech.in/ | grep assets/index-*.js`).
- Backend settings apply immediately (no redeploy); frontend needs a rebuild for VPA changes.

---

## 6. Known limitations

- **No auth** → subscription is device-local, not per-user; can't be revoked remotely.
- **Confirmation latency** is bank-email-bound (~seconds to a minute); truly instant needs a PSP.
- Real project-tool read/write beyond Linear is planned (Jira / Azure DevOps).

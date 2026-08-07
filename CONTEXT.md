# SprintDeck V2 — Project Context Index

_Last updated: 2026-08-07. Maintain this file as the single reference for project structure, architecture, and current state._

## 1. What This Is

SprintDeck Enterprise (V2) is a **real-time planning poker + integrations hub** for agile teams.
It connects to project management tools (Linear, Jira, Azure DevOps), pulls estimation tickets,
and writes agreed story points back. No login required — share a room code.

- **Live:** `https://<your-swa-domain>.azurestaticapps.net`
- **Free sibling (plain poker):** https://sprintdeck.rajeevstech.in
- **Repo:** `rajeevp727/SprintDeck_V2`

## 2. Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5 |
| API | Azure Functions (Node v4) |
| Database | Azure Cosmos DB (serverless) + in-memory fallback |
| Realtime | Short polling (1.5s) + Azure Web PubSub (chat) |
| Deploy | Azure Static Web Apps (Free tier) |
| Testing | Vitest (unit) |

## 3. Directory Structure

```
/workspaces/SprintDeck_V2/
├── index.html                 # Vite entry
├── package.json               # Web app deps + scripts
├── vite.config.ts             # Vite + SWA proxy config
├── tsconfig.json              # TS config
├── eslint.config.js           # ESLint flat config
├── staticwebapp.config.json   # SWA config (routes, headers)
├── PRD.md                     # Product requirements / roadmap
├── CHANGELOG.md               # Dated change log
├── README.md                  # Setup + deploy docs
├── CONTEXT.md                 # ← this file: project index
│
├── src/
│   ├── main.tsx               # React mount
│   ├── App.tsx                 # Router + top-level state
│   ├── styles.css              # Global styles
│   ├── vite-env.d.ts           # Vite type declarations
│   │
│   ├── components/            # React components (28 files)
│   │   ├── Room.tsx            # Main planning poker room
│   │   ├── RetroBoard.tsx      # Retrospective board (Miro-like)
│   │   ├── Dashboard.tsx       # Signed-in home (ceremonies list)
│   │   ├── Landing.tsx         # Public landing page
│   │   ├── Home.tsx            # Create/join room form
│   │   ├── AuthScreen.tsx      # Login/register
│   │   ├── ConnectToolModal.tsx # Linear/Jira/ADO picker
│   │   ├── ToolConnectModal.tsx # Per-tool API key entry
│   │   ├── ResultsModal.tsx    # Estimation results + export
│   │   ├── ChatPanel.tsx       # Team chat (PRO+)
│   │   ├── SubscriptionModal.tsx # UPI QR + tier picker
│   │   ├── ThemeToggle.tsx     # Light/dark mode
│   │   ├── BrandLogo.tsx       # SVG logo
│   │   ├── LinearLogo.tsx      # Linear logomark
│   │   ├── StandupTimesheet.tsx # Timesheet feature
│   │   ├── AdBanner.tsx        # Ad placements
│   │   ├── StickyAd.tsx        # Sticky footer ad
│   │   ├── ErrorBoundary.tsx   # React error boundary
│   │   ├── Toast.tsx           # Toast notifications
│   │   ├── ProfileMenu.tsx     # User profile dropdown
│   │   ├── ChangePasswordModal.tsx
│   │   ├── Privacy.tsx / Terms.tsx / Security.tsx # Legal pages
│   │   ├── icons.tsx           # Shared SVG icon components
│   │   └── ...                 # Lazy-loaded routes
│   │
│   ├── lib/                   # Core logic modules (22 files)
│   │   ├── api.ts             # HTTP client + all REST endpoints
│   │   ├── types.ts           # Shared TypeScript types (Session, Participant, etc.)
│   │   ├── storage.ts         # localStorage identity helpers
│   │   ├── auth.ts            # JWT auth (custom header x-auth-token)
│   │   ├── theme.ts           # System/light/dark theme
│   │   ├── estimate.ts        # Fibonacci deck + nearest-value logic
│   │   ├── estimate.test.ts   # Unit tests
│   │   ├── subscription.ts    # Plan tiers + localStorage activation
│   │   ├── verifier.ts        # UPI payment status checker
│   │   ├── realtime.ts        # Azure Web PubSub hook
│   │   ├── presence.ts        # Join/leave toast notifications
│   │   ├── chat.ts            # Chat realtime helpers
│   │   ├── analytics.ts       # Client-side event tracking
│   │   ├── analytics.test.ts
│   │   ├── telemetry.ts       # Error → App Insights /api/log
│   │   ├── export.ts          # Session export (.txt/.csv/.json)
│   │   ├── retroApi.ts        # Retrospective API client
│   │   ├── retroTypes.ts      # Retro board types
│   │   ├── retroExport.ts     # Retro export formats
│   │   ├── perf.ts            # Performance marks
│   │   ├── rememberedAccounts.ts # Auth account persistence
│   │   └── upi-verifier/      # UPI payment verification (serverless func)
│   │
│   ├── public/                # Static assets (favicon, images)
│   └── dist/                   # Build output (gitignored)
│
├── api/                       # Azure Functions backend
│   ├── host.json
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       ├── functions/
│       │   ├── poker.js       # Session CRUD, voting, queue
│       │   ├── retro.js       # Retrospective board CRUD
│       │   ├── chat.js        # Team chat messages
│       │   ├── negotiate.js   # Web PubSub negotiation
│       │   ├── linear.js      # Linear integration (mock)
│       │   ├── auth.js        # JWT auth endpoints
│       │   ├── payments.js    # Subscription/UPI
│       │   └── ...            # Other function triggers
│       ├── store.js           # In-memory session store (local dev)
│       ├── store.test.mjs
│       ├── retroStore.js      # In-memory retro store
│       ├── users-store.js     # Auth user store
│       ├── payments-store.js  # Subscription order store
│       ├── linear.js          # Linear provider helper
│       ├── linear.test.mjs
│       ├── jwt.js             # JWT utilities
│       ├── parse.js           # Request parsing helpers
│       └── ratelimit.js       # IP rate limiter
│
├── integrations/              # External integrations (bookmarklets, extensions)
├── .github/workflows/         # CI (test.yml, deploy)
└── node_modules/              # Web deps
```

## 4. Key Architecture Patterns

### Routing
- SPA router in `App.tsx` (no react-router). Route is a discriminated union:
  `room | retro | retroJoin | privacy | terms | security | auth | plan | retroStart | timesheet | home`
- Room codes are **not** in the URL (stored in `localStorage`). Invite links use `?room=CODE`.
- Retro boards keep the code in the URL: `/retro/CODE`.

### Data Flow
- Frontend polls `api.getSession()` every **1.5s** for room state.
- Chat uses **Azure Web PubSub** for real-time; everything else is polling.
- All API requests go through `src/lib/api.ts` → `request()` with `x-auth-token` header
  (SWA strips `Authorization`, so a custom header is used).

### Identity
- No global auth/accounts on V2 (anonymous rooms).
- Identity is per-room in `localStorage` (`pp.identity` map): `{ code: { participantId, name } }`.
- `src/lib/auth.ts` provides optional JWT for future account features.

### Subscription Gating
- Tiers: Pro / Expert / Master.
- UPI payment → manual activation (no auto-confirm).
- Subscribed state in `localStorage`; verified server-side by `subRef` (order ID).
- PRO+ features: chat, retrospective, whiteboard (planned).

### Polling Resilience
- Miss tolerance: **6 consecutive** "not found" polls before leaving a room.
- Polling pauses when `document.hidden` (tab backgrounded).

## 5. Current Features (by PRD task ID)

| ID | Feature | Status |
|---|---|---|
| T1 | Real Linear integration (live read/write) | **Blocked** — needs OAuth app |
| T2 | Automated tests (unit in CI) | ✅ Done |
| T3 | Persistence policy (retention, export, delete, backups) | ✅ Done |
| T4 | Security hardening (headers, Dependabot, rate limit) | ✅ Done |
| T6 | Legal (Terms + Security pages) | ✅ Done (partial) |
| T7 | Monetization (subscription popup + UPI QR) | ✅ Done (manual activation) |
| T8 | Accessibility & polish | ✅ Done |
| T9 | Differentiation (session analytics) | ✅ Partial (cross-sprint deferred) |
| T10 | Additional integrations (Jira, Azure DevOps) | Pending |

## 6. Recent Changes

- **2026-07-06 (T7):** Subscription popup + UPI QR + code cleanup.
- **2026-07-06 (remediation):** Tests, security headers, accessibility, legal pages,
  persistence, observability, analytics.
- **2026-07-06:** Integrations hub UI (mock), light/dark theme, manual tasks.

## 7. Running Locally

```bash
npm install && npm --prefix api install
npm run dev:all    # web :5273 + Functions :7072
npm run build      # tsc -b && vite build
npm run test       # vitest run
npm run lint       # eslint .
```

- API uses in-memory store locally. Set `COSMOS_CONNECTION_STRING` in
  `api/local.settings.json` for Cosmos.
- **Gotcha:** `npm run build` emits `vite.config.js` (gitignored). Delete it before `dev:all`.

## 8. Deployment

- Azure Static Web App `SprintDeck-Enterprise` (Free).
- Repo `rajeevp727/SprintDeck_V2`, branch `main` → auto-deploy.
- Build: App `/`, API `api`, Output `dist`.
- Env vars: `COSMOS_CONNECTION_STRING`, `UPI_ID`, `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING`, etc.

## 9. Planned / In Progress

- **Whiteboard feature** (Miro/MS Whiteboard style) — in progress.
- Real Linear integration (T1).
- Jira / Azure DevOps adapters (T10).
- Cross-sprint velocity analytics (T9).

## 10. Important Conventions

- **No comments** unless explicitly requested.
- Components are PascalCase; hooks use `use` prefix; modules are camelCase.
- Lazy-load heavy modals (`React.lazy` + `Suspense`).
- Use `edit` tool for file changes (never `sed`/`awk`/`echo >`).
- Update this `CONTEXT.md` after every significant change.

# SprintDeck — Enterprise Edition (V2)

The **paid, integrations-focused** edition of SprintDeck: real-time planning poker
that connects to your **project management tool** (Linear, Jira, Azure DevOps),
pulls the tickets you need to estimate, and **writes the agreed story points back**
after the team votes. No login — you connect a tool with your own key.

- **Live:** https://sprintdeckv2.rajeevstech.in
- **Free sibling (plain poker, no integrations):** https://sprintdeck.rajeevstech.in (repo `SprintDeck`)

> **Status:** the integration layer is currently **mock/preview** — connecting a
> tool loads sample estimation tickets and the push-back is simulated. The real
> read/write (roadmap **T1/T10**) is not wired yet. See `CHANGELOG.md` and `PRD.md`.

## Stack
- **Frontend:** React + TypeScript + Vite
- **API:** Azure Functions (Node v4), served at `/api` by Static Web Apps
- **Storage:** Azure Cosmos DB (serverless) with in-memory fallback for local dev
- **Sync:** short polling every 1.5s (no extra real-time infra)
- **Join model:** shareable room code / invite link, **no login**

## Features
- **Connect a project management tool** — picker (Linear · Jira · Azure DevOps) →
  paste a **read/write API key** → pull the tool's estimation view into the queue.
  *(mock today; real per provider adapter later.)*
- **Estimation flow** — start a ticket → hidden Fibonacci voting → reveal →
  moderator confirms the agreed value → **push story points back** to the ticket.
- **Story states** — current ticket highlighted ("Estimating…"), estimated ones
  greyed out with their points.
- **Manual tasks** — add ad-hoc tasks (one per line) without any tool.
- **Light / dark theme** — defaults to the system theme; header toggle.
- **Results history + export** — every estimated story saved; export `.txt` / `.csv`.
- **Unviewed-results nudge** — the Results badge + close warning only fire when
  there are results you haven't opened.

## Run locally
V2 runs on its **own ports** (so it can run beside V1): web **5273**, API **7072**.

```bash
npm install && npm --prefix api install
npm run dev:all          # web :5273 + Functions :7072
```

- API falls back to in-memory storage locally; set `COSMOS_CONNECTION_STRING` in
  `api/local.settings.json` to use Cosmos.
- **Local dev note:** `npm run build` emits a `vite.config.js` (gitignored). If it
  appears, delete it before `dev:all` or Vite may load the wrong ports.

## Deploy (Azure Static Web Apps, Free)
- Repo `rajeevp727/SprintDeck_V2`, branch `main` → auto-deploys via
  `.github/workflows/azure-static-web-apps-green-desert-0f2350910.yml`.
- Build config: App `/`, **Api `api`**, **Output `dist`**.
- Env vars (SWA → Configuration): `COSMOS_CONNECTION_STRING` (persistence).
- Custom domain: `sprintdeckv2.rajeevstech.in` (CNAME → `…azurestaticapps.net`).

## Integration API (current)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/linear/status` | Is a server-side Linear key configured? |
| POST | `/api/session/{code}/linear/import` | Resolve pasted ticket IDs → queue |
| POST | `/api/session/{code}/linear/import-estimation` | Load the estimation view (mock) → queue |
| POST | `/api/session/{code}/linear/push` | Write the agreed estimate back to the issue |

Plus the core room API (`/api/session…` create/join/vote/start/reveal/reset/queue/next/end).

## Project layout (V2-specific additions)
```
src/components/
  ConnectToolModal.tsx   # picker: Linear / Jira / Azure DevOps (+ TOOL_META)
  ToolConnectModal.tsx   # per-tool read/write API-key entry (back + close)
  LinearLogo.tsx         # inline Linear logomark
  ThemeToggle.tsx        # light/dark toggle
  Room.tsx               # estimation list, connect flow, push-back
src/theme.ts             # system/light/dark theme handling
api/src/linear.js        # provider helper: resolveIssues / setEstimate / mock estimation
```

## Docs (kept up to date)
- **`PRD.md`** — product vision, scope, tiers, roadmap.
- **`CHANGELOG.md`** — dated log of what changed each working day.

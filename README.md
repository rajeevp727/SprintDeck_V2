# SprintDeck

Real-time sprint estimation (planning poker) for distributed teams. Create a room,
share the code/link, everyone picks a card, the moderator reveals — average and
consensus shown instantly. Built to run **free** on Azure Static Web Apps.

- **Frontend:** React + TypeScript + Vite
- **API:** Azure Functions (Node v4, in-memory store) — served at `/api` by Static Web Apps
- **Sync:** short polling every 1.5s (no extra Azure resources)
- **Join model:** shareable 5-char room code / invite link, no login

## Architecture

```
Browser (React)  ──poll /api/session/{code}──▶  Azure Functions  ──▶  in-memory Map
     ▲  click card / reveal (POST)                    │
     └────────────── JSON state ◀─────────────────────┘
```

Sessions live in the Functions process memory. There is **no database** — this was
a deliberate choice for a free, zero-ops live-estimation tool.

### ⚠️ Important caveat about in-memory state

Static Web Apps' **managed** Functions are serverless. Two things to know:

1. **Cold start:** after a few minutes idle the process spins down. The *first*
   request afterward is slow, and any in-flight session from before is gone.
2. **Scale-out:** under load Azure may run more than one instance; they don't
   share memory.

For a single small team doing live estimation this is fine — a session only needs
to survive the meeting, and the moderator can always spin up a fresh room in
seconds. If you later need sessions to persist (history, reconnect hours later,
many concurrent teams), swap the `api/src/store.js` Map for **Cosmos DB free tier**
(1000 RU/s + 25 GB free, with TTL auto-expiry) — the store module is the only file
that would change.

The app already self-heals: stale participants are pruned after 30s, sessions
after 12h, and if a client polls a room that has evaporated it's bounced back to
the join screen.

## Run locally

You need two terminals.

```bash
# 1. API (Azure Functions) — needs Azure Functions Core Tools v4
cd api
npm install
npm start          # -> http://localhost:7071

# 2. Frontend (Vite) — proxies /api to :7071 (see vite.config.ts)
npm install
npm run dev        # -> http://localhost:5173
```

Open http://localhost:5173, create a session, and open the invite link in another
browser/incognito window to simulate a teammate.

> Don't have Core Tools? Install with `npm i -g azure-functions-core-tools@4 --unsafe-perm true`
> or via the [VS Code Azure Functions extension](https://learn.microsoft.com/azure/azure-functions/functions-develop-vs-code).

## Deploy to Azure Static Web Apps (free)

1. Push this repo to GitHub.
2. In the Azure Portal: **Create a resource → Static Web App**.
   - Plan type: **Free**
   - Deployment source: **GitHub** → pick this repo/branch (`main`)
   - Build presets: **React**
   - **App location:** `/`
   - **Api location:** `api`
   - **Output location:** `dist`
3. Azure commits a workflow file and injects `AZURE_STATIC_WEB_APPS_API_TOKEN`
   into your repo secrets. (A ready-made workflow is already in
   `.github/workflows/` — if Azure adds its own, keep one and delete the other so
   they don't both run.)
4. Every push to `main` builds and deploys. Your app is live at
   `https://<name>.azurestaticwebapps.net`.

No database, no app settings, nothing else to configure. The API ships as managed
functions inside the same Static Web App, so `/api/*` just works on the same origin.

## API reference

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | `/api/session` | anyone | Create a room; caller becomes moderator |
| POST | `/api/session/{code}/join` | anyone | Join a room with a name |
| GET  | `/api/session/{code}?participantId=` | anyone | Poll room state (votes hidden until revealed) |
| POST | `/api/session/{code}/vote` | participant | Cast/clear a vote |
| POST | `/api/session/{code}/start` | moderator | Set story + open voting |
| POST | `/api/session/{code}/reveal` | moderator | Reveal all cards + average |
| POST | `/api/session/{code}/reset` | moderator | Clear votes, vote again |
| POST | `/api/session/{code}/story` | moderator | Update the story name |

## Project layout

```
sprintdeck/
├─ api/                      # Azure Functions (Node v4)
│  ├─ src/store.js           # in-memory session store (swap this for a DB later)
│  ├─ src/functions/poker.js # all HTTP endpoints
│  ├─ host.json
│  └─ package.json
├─ src/                      # React app
│  ├─ components/Home.tsx    # create / join
│  ├─ components/Room.tsx    # the table: seats, deck, moderator controls
│  ├─ api.ts                 # typed fetch client
│  ├─ storage.ts             # remembers your identity per room (localStorage)
│  ├─ App.tsx                # hash router (#/room/CODE)
│  └─ types.ts
├─ staticwebapp.config.json  # SPA fallback + api runtime
├─ vite.config.ts            # dev proxy /api -> :7071
└─ .github/workflows/        # SWA deploy
```

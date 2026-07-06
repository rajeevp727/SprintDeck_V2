# Changelog — SprintDeck Enterprise (V2)

Dated log of changes, updated each working day. Newest first.
See `PRD.md` for product direction and `README.md` for setup.

## 2026-07-06
**Integrations-hub UI + product docs (all integration data is mock/preview).**

Added
- **Connect a project management tool** picker (Linear · Jira · Azure DevOps) with per-tool logos and status.
- **Per-tool API-key entry** modal (read/write) — pulls the estimation view; **← back** to the picker, **✕** to close, shake-on-outside-click.
- **Estimation flow states** — current ticket highlighted ("Estimating…"), estimated tickets greyed with points.
- **Manual task entry** (add tasks without a tool).
- **Light/dark theme** with system default (header toggle).
- **Header links** — app name + room code are anchors (Ctrl/Cmd-click opens the room in a new tab).
- **Unviewed-results** logic — Results badge + close warning only when unopened results exist.
- Deployed as Azure Static Web App `SprintDeck-Enterprise` (Free) on `sprintdeckv2.rajeevstech.in`; branding "Enterprise Edition" + spade favicon.
- Product docs: rewrote `README.md` for V2, added `PRD.md`, this `CHANGELOG.md`.

Changed
- Terminology → **"project management tool"** across the connect UI.
- Estimate "Start voting" is disabled until a tool is connected or a task exists.

Removed
- Mock MFA modal + `/api/linear/oauth/status` endpoint (superseded by key entry).
- Orphaned CSS; untracked `*.tsbuildinfo` build caches.

Notes / not done
- **Real read/write is not wired** — connecting loads sample tickets; push-back is simulated.
- **T1 (real Linear)** blocked: needs a Linear OAuth app + org re-enabling API keys.

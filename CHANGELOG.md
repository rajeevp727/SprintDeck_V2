# Changelog — SprintDeck Enterprise (V2)

Dated log of changes, updated each working day. Newest first.
See `PRD.md` for product direction and `README.md` for setup.

## 2026-07-06 (T7) — subscriptions + code cleanup
- **T7 · Monetization** — subscription popup shown on moderator room-entry (unless subscribed/dismissed): tiers **Pro / Expert / Master**, pay via **UPI QR** (`qrcode.react`). VPA sourced from GitHub secret **`UPI_ID`** → `VITE_UPI_ID` (never hardcoded; `.env.local` for dev, workflow env for prod). "Upgrade" button in the room header; subscribed state in localStorage (activation is manual — UPI has no auto-confirmation).
- **Cleanup / optimize** — removed dead `SHOW_QUEUE` queue panel + drag-reorder code (`dragIndex`/`dropOnQueueItem`); extracted shared `CloseIcon`/`BackIcon` (dedup modal SVGs); added `vite-env.d.ts`; pruned orphaned CSS (`.story-input`, `.q-handle`, `.dragging`, cursor overrides).

## 2026-07-06 (later) — report-card remediation batch
Hardening pass toward the due-diligence report card (each its own commit):

- **T2 · Tests** — vitest unit tests (estimate/store/linear, 14 total) + `.github/workflows/test.yml` CI.
- **T4 · Security** — global security headers (nosniff/frame-deny/HSTS/referrer/permissions) in `staticwebapp.config.json`; Dependabot (npm + actions); per-IP rate limit on room creation.
- **T8 · Accessibility** — keyboard `:focus-visible` ring, `prefers-reduced-motion` support, aria-labels/aria-hidden on icons, deck cards `aria-label`+`aria-pressed`, SVG sun/moon theme icons.
- **T6 · Legal** — Terms (`/terms`) + Security (`/security`) pages, linked in the footer.
- **T3 · Persistence** — configurable retention (`SESSION_IDLE_HOURS`/`SESSION_MAX_AGE_HOURS`), full-session **JSON export**, documented backup/delete policy.
- **T5 · Observability** — client error tracking → `/api/log` → Azure Application Insights (`src/telemetry.ts`, ErrorBoundary hook); Sentry-ready.
- **T9 · Differentiation** — session estimation analytics (total points / consensus % / avg spread / contested / distribution) in the Results modal. Cross-sprint velocity deferred (needs persistence + identity).

Not done: **T1** (real Linear integration — blocked on OAuth app + org policy), **T7** (PhonePe UPI monetization), **T10** (Jira/ADO integrations).

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

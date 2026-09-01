# SprintDeck V2 — Agent memory & operating playbook

> **Purpose:** Persistent context for Cursor Cloud Agents. Read this at the start of every task.
> Pair with `AGENTS.md` for environment specifics.

---

## Product context

| Item | Value |
|------|--------|
| **Product** | SprintDeck Enterprise Edition (V2) |
| **Live** | https://sprintdeck.in |
| **Repo** | `rajeevp727/SprintDeck_V2` |
| **Base branch** | `main` (auto-deploys to Azure Static Web Apps) |
| **Positioning** | Paid, integrations-focused planning poker + retros, whiteboards, standups, auth, subscriptions |

### What “good” looks like (Product Owner bar)

- **Robust:** Works on mobile and desktop; handles errors gracefully; no dead ends; secure defaults (CSP, auth, GDPR flows).
- **Impressive UI/UX:** Consistent visual language, purposeful motion, clear hierarchy, accessible labels, fast perceived performance.
- **Shippable:** Every change is tested, passes CI, merged to `main`, and deployed without hand-holding.

### Active product areas (keep in mind)

- **Auth:** Email/password + Microsoft/Google SSO, password reset, profile, GDPR export/delete
- **Subscriptions:** Paid tiers, payment confirmation, lifetime allowlist
- **Collab:** Retros, shared whiteboards, standup timesheets, real-time sync
- **Integrations:** Linear/Jira/Azure DevOps (mock/preview today; real adapters on roadmap)

---

## Agent roles — how to behave every session

Act as **three roles at once**:

### Persistent delivery standard

- Treat every user request as an owned product requirement: investigate the root cause, implement the smallest complete fix, validate it, and report the real delivery status.
- Work as a senior full-stack engineer on every task: consider client behavior, API behavior, deployment configuration, security, tests, and operational impact where applicable.
- Do not stop at diagnosis when a repository change can resolve the issue. For production incidents, verify that the deployment path actually publishes the corrected artifact.
- For every code change, create a ready-for-review PR, ensure it is approved/auto-merged according to the workflow, and confirm the production deployment before declaring the request complete. If an external limitation prevents this, state the exact limitation and the next required system action.

### 1. Senior software engineer

- Minimal, focused diffs — solve the root cause, don’t gold-plate.
- Match existing patterns (naming, types, file layout, CSS variables in `src/styles.css`).
- Reuse and extend existing functions/components before adding new abstractions.
- Comments only for non-obvious business logic.
- Never commit debug/temporary code.

### 2. Project manager

- Break work into testable increments; finish one PR-worthy slice before starting the next.
- **Never leave PRs open and blocked** when you can fix CI yourself.
- Track required checks: `test`, `PR Build` (or `Build and Deploy Job` on main).
- After merge, assume deploy pipeline runs — no manual deploy unless asked.

### 3. Product owner

- Prioritize user-visible quality: copy, spacing, mobile layout, error messages, loading states.
- Ask “Would a skeptical engineer trust this?” before calling work done.
- Provide walkthrough evidence (screenshots/video/logs) for non-trivial UI or behavior changes.

---

## Mandatory PR workflow (every code change)

Use this checklist **after every implementation**. Do not skip steps.

### Branch & commit

```
git checkout main && git pull origin main
git checkout -b cursor/<short-descriptive-name>-1307
# implement + test locally
git add <files>
git commit -m "<clear imperative message>"
git push -u origin cursor/<short-descriptive-name>-1307
```

- Branch prefix: **`cursor/`** (required for auto-merge)
- Branch suffix: **`-1307`**
- Lowercase only in branch names
- One logical change per commit when possible

### Create & publish PR

1. Create PR via `ManagePullRequest` (`base`: `main`, `branch_name`: your branch)
2. **Mark ready for review** — never leave agent PRs as draft unless explicitly asked
3. Use PR template if one exists (`.github/PULL_REQUEST_TEMPLATE.md`)

### Pre-push quality gate (local — run before every push)

```bash
npm run lint          # ESLint — 0 errors required
npm test              # Vitest — all tests pass
npm run coverage      # Required in CI; thresholds in vitest.config.ts
npm run build         # tsc + vite production build
```

API changes: `npm --prefix api install` if dependencies changed.

### Auto-approve & auto-merge (required)

**Goal:** Every `cursor/*` PR merges itself when CI is green.

| Step | Who | Action |
|------|-----|--------|
| 1 | Agent | Push branch, create PR, mark **ready** (not draft) |
| 2 | CI | `Tests` + `PR Build` must pass |
| 3 | Workflow | `.github/workflows/auto-merge.yml` squash-merges the PR |

**Agent responsibilities:**

- [ ] Push all commits before creating/updating the PR
- [ ] Set `draft: false` when creating or updating the PR
- [ ] If CI fails → fix, commit, push, wait for green — **do not ask the user to merge**
- [ ] If merge doesn’t happen within ~2 min after checks pass, run `gh pr view <n> --json state,mergedAt` and investigate logs
- [ ] Do **not** manually `gh pr merge` unless auto-merge workflow is broken and user asked

**Auto-approve note:** GitHub may block Actions from approving PRs (`GitHub Actions is not permitted to approve`). That is OK — this repo does not require approval for merge; the workflow merges directly when checks pass.

**GitHub native auto-merge** (`gh pr merge --auto`) is **disabled** on this repo. Rely on `auto-merge.yml` only.

### Post-merge

- Confirm PR state: `MERGED`
- Summarize what shipped and what to verify on https://sprintdeck.in
- Leave services running after manual testing (don’t kill dev servers)

---

## Coding standards

### TypeScript / React (`src/`)

- Functional components, hooks, explicit types at module boundaries
- ESLint config: `eslint.config.js` — complexity ≤18 (warn), max function lines 120 (warn)
- Prefer `src/lib/` for pure logic; keep components thin
- OAuth config: `src/lib/oauthConfig.ts` (singleton MSAL, runtime config from `/api/auth/oauth-status`)
- Auth client: `src/lib/auth.ts`

### API (`api/src/`)

- Azure Functions v4, CommonJS modules
- Auth routes: `api/src/functions/auth.js`
- OAuth verification: `api/src/oauth.js`
- Users: `api/src/users-store.js`
- Tests: `api/**/*.test.mjs` (Vitest, node environment)

### CSS (`src/styles.css`)

- Use existing CSS variables: `--panel`, `--line`, `--accent`, `--muted`, `--radius`, `--transition`
- Mobile-first fixes: test at ≤760px width
- Auth UI classes: `.auth-book`, `.auth-leaf`, `.auth-social-*`, `.auth-divider`
- Avoid one-off magic numbers when a variable already exists

### Security & config

- Never commit secrets; use Azure SWA app settings / GitHub secrets
- `APP_URL` for password-reset links (not `WEBSITE_HOSTNAME`)
- CSP in `staticwebapp.config.json` — update when adding OAuth domains
- Public OAuth client IDs are OK in API responses; secrets stay server-side

### Testing

| Command | When |
|---------|------|
| `npm test` | Always before push |
| `npm run coverage` | When touching covered modules (`vitest.config.ts` include list) |
| Manual UI test | Non-trivial `.tsx` / CSS UX changes — use browser/computerUse + video artifact |

Coverage thresholds (must pass in CI):

- Statements ≥ 40%, Branches ≥ 35%, Functions ≥ 40%, Lines ≥ 40%

---

## UI/UX principles (apply to every frontend change)

1. **Consistency** — SSO buttons, form fields, CTAs, and dividers share the same width, height, and spacing rhythm.
2. **Mobile first** — No clipped content; scrollable panels; touch-friendly tap targets (≥44px effective).
3. **Clear states** — Loading (“Signing in…”), error (actionable copy), empty, success.
4. **Accessible** — `aria-label`, `role`, focus rings, semantic headings; don’t rely on color alone.
5. **Performance** — Lazy-load heavy routes; avoid layout shift; respect `prefers-reduced-motion`.
6. **Polish** — Micro-copy matters (“or continue with email” not “or use email”); icons aligned with labels.

---

## Key file map

| Area | Path |
|------|------|
| Login / signup UI | `src/components/AuthScreen.tsx` |
| SSO buttons | `src/components/SocialAuthButtons.tsx` |
| OAuth icons | `src/components/OAuthBrandIcons.tsx` |
| MSAL / OAuth config | `src/lib/oauthConfig.ts` |
| Auth API | `api/src/functions/auth.js` |
| Auto-merge workflow | `.github/workflows/auto-merge.yml` |
| Deploy workflow | `.github/workflows/azure-static-web-apps-green-desert-0f2350910.yml` |
| Agent quick ref | `AGENTS.md` |

---

## Environment (Cloud Agent)

```bash
npm run dev:all    # Vite :5273 + API :7072
```

OAuth providers configured via Azure env vars: `AZURE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `APP_URL`.

Local templates: `.env.example`, `api/local.settings.example.json`

---

## Definition of done (non-negotiable)

- [ ] Solves the user request completely
- [ ] Follows coding standards above
- [ ] `lint` + `test` + `coverage` + `build` pass locally
- [ ] PR created on `cursor/*-1307`, marked ready
- [ ] CI green → auto-merged to `main`
- [ ] Evidence provided for UI/behavior changes (artifact or logs)
- [ ] No debug code committed

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| Coverage CI fail | Add tests in `src/lib/*.test.ts` or `api/src/*.test.mjs`; run `npm run coverage` |
| Auto-merge skipped | Branch must start with `cursor/`; checks must pass; PR must not stay draft |
| `interaction_in_progress` (MSAL) | `oauthConfig.ts` mutex + `handleRedirectPromise` — don’t create duplicate MSAL instances |
| Password reset wrong host | Set `APP_URL=https://sprintdeck.in` in Azure + workflow sync |
| Deploy YAML duplicate keys | Check `azure-static-web-apps-*.yml` for duplicate `env:` blocks |

---

*Last updated: 2026-08-14 — update this file when merge policy, stack, or product priorities change.*

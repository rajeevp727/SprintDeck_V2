# Agent instructions

> **Full playbook:** read [`memory.md`](./memory.md) first — product context, PR auto-merge checklist, coding standards, and UI/UX bar.

## Pull requests

- **Always auto-merge** PRs you create on `cursor/*` branches:
  1. Mark the PR ready for review (not draft) after pushing.
  2. Ensure CI passes (`Tests` + `PR Build` / `Build and Deploy Job`).
  3. The workflow `.github/workflows/auto-merge.yml` squash-merges when checks succeed — no manual merge needed.
- GitHub’s native “Enable auto-merge” is **not** available on this repo; rely on the workflow above.
- If CI fails, fix the failure and push again — do not leave PRs blocked when you can resolve the issue.

## Testing

- Run `npm run build`, `npm run lint`, and `npm test` (or `npm run coverage` when touching covered modules) before pushing.
- Coverage thresholds in `vitest.config.ts` must pass in CI.

## Cloud Agent environment

- `npm run dev:all` — Vite on port 5273 + API on 7072
- OAuth client IDs are loaded at runtime from `/api/auth/oauth-status`

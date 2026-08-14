# Agent instructions

## Pull requests

- **Always enable auto-merge** on PRs you create: mark the PR ready for review (not draft) and run `gh pr merge <number> --auto --squash` after pushing.
- The repo workflow `.github/workflows/auto-merge.yml` squash-merges `cursor/*` PRs when CI passes; enabling GitHub auto-merge ensures the PR merges as soon as required checks succeed.
- If CI fails, fix the failure and push again — do not leave PRs blocked when you can resolve the issue.

## Testing

- Run `npm run build`, `npm run lint`, and `npm test` (or `npm run coverage` when touching covered modules) before pushing.
- Coverage thresholds in `vitest.config.ts` must pass in CI.

## Cloud Agent environment

- `npm run dev:all` — Vite on port 5273 + API on 7072
- OAuth client IDs are loaded at runtime from `/api/auth/oauth-status`

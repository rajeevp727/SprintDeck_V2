# Operations

Everything needed to run the service: configuration, deployment, routine tasks and what to do
when something breaks.

## Environments

| | |
|---|---|
| Production | https://sprintdeck.in — Azure Static Web App, Azure Cosmos DB `sprintdeck` |
| Local | `npm run dev:all` — API on :7072, web on :5273, stores in memory unless Cosmos is configured |

There is no staging environment. `main` is production.

## Configuration

### Azure application settings (server, effective immediately)

| Setting | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | **Yes** | Signs session tokens. Without it auth endpoints answer 503 |
| `COSMOS_CONNECTION_STRING` | **Yes** | Database. Without it every store silently falls back to per-instance memory |
| `COSMOS_DB_NAME` | No | Defaults to `sprintdeck` |
| `GOOGLE_CLIENT_ID` | For Google sign-in | Audience the Google `id_token` is checked against |
| `AZURE_CLIENT_ID` | For Microsoft sign-in | Audience the Microsoft `id_token` is checked against |
| `AZURE_TENANT_ID` | For Microsoft sign-in | `common` for any account, or a directory id to restrict |
| `RESEND_API_KEY` or `SENDGRID_API_KEY` | For password reset | Outbound mail. Without it the link is logged, not sent |
| `EMAIL_FROM` | With mail | Sender address |
| `APP_URL` | Yes in production | Base URL used to build reset links |
| `INGEST_SECRET` | For payments | Authenticates bank-credit posts. Ingest refuses to run when unset |
| `WEBPUBSUB_CONNECTION_STRING` | For live rooms | Real-time transport; polling fallback without it |
| `LINEAR_API_KEY` | For Linear demo | Customers supply their own key at runtime |
| `LIFETIME_ALLOWLIST` | No | Comma-separated addresses allowed to hold a lifetime plan |
| `ORDER_TTL_MINUTES`, `SESSION_IDLE_HOURS`, `SESSION_MAX_AGE_HOURS` | No | Expiry windows |

### GitHub secrets and variables (build time)

`GOOGLE_CLIENT_ID`, `AZURE_CLIENT_ID`, `UPI_ID` (secrets) and `AZURE_TENANT_ID` (variable) are
compiled into the bundle as `VITE_*`.

> **These two sets are separate.** A client id must be in *both* places: GitHub for the browser,
> Azure for the API. If they disagree, sign-in fails with an audience mismatch. Changing a
> GitHub secret requires a **rebuild**; changing an Azure setting takes effect on the next
> request.

## Deploying

Push to `main`. The workflow runs `npm ci`, builds, and uploads `dist/` plus `api/`.

Trigger without a code change: Actions → *Azure Static Web Apps CI/CD* → **Run workflow**.

Verify after a deploy:

```bash
curl -s https://sprintdeck.in/api/auth/oauth-status     # client ids the API holds
curl -s -o /dev/null -w '%{http_code}' https://sprintdeck.in/
```

## Routine tasks

### Grant or change a plan

```bash
node scripts/grant-plan.mjs google:someone@example.com master --lifetime
```

Prints the four fields to paste onto the account document in the `users` container, or applies
them directly with `--write` and `COSMOS_CONNECTION_STRING` set. Account ids carry the
provider — `google:`, `microsoft:`, or the bare email for a password account.

To revoke, set `"tier": "free"`.

### Run migrations

```bash
COSMOS_CONNECTION_STRING="…" npm run migrate
```

Applies anything not in the `migrations` ledger. Safe to re-run.

### Reconcile a payment by hand

Find the pending order in `users` (`type = "order"`), confirm the bank credit exists, then set
`status` to `confirmed`, fill `confirmedAt`, and set the tier on the buyer's account document.

## Incident playbook

| Symptom | First thing to check |
|---|---|
| Site loads blank | Actions — a failed build leaves the previous deployment in place; a *successful* build with a broken bundle does not. Check the served `index.html` references `/assets/*.js`, not `/src/main.tsx` |
| Sign-in fails with "Invalid token" | `curl /api/auth/oauth-status` and compare the client ids with the GitHub secrets. A mismatch is an audience failure |
| Sign-in popup closes with no error | Check `Cross-Origin-Opener-Policy` on `/auth/*/callback` — it must be `unsafe-none` |
| "not configured" on a provider button | The `VITE_*` secret was missing at build time. Add it and **rebuild** |
| Plans disappeared for everyone | Check `COSMOS_CONNECTION_STRING` is still set. Without it the API serves from empty per-instance memory and reports no errors |
| Password reset emails not arriving | `curl /api/auth/email-status` → `configured: false` means no `RESEND_API_KEY`/`SENDGRID_API_KEY`; the link is in the application log |
| Payments confirm late or not at all | The bank-notification pipeline (`integrations/gmail-ingest.gs`) or `INGEST_SECRET` |

## Backups

Cosmos DB continuous backup applies at the account level; verify it is enabled in the portal.
There is no application-level export or restore procedure, and no restore has been rehearsed.

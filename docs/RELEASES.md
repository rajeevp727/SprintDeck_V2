# Releases

## Current release

| | |
|---|---|
| **Version** | **2.1.0** |
| Date | 2026-09-21 |
| Environment | Production — https://sprintdeck.in |
| Status | Live. Not yet cleared for general availability — see [SCOPE.md](SCOPE.md#known-gaps) |

## Versioning

[Semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Part | Increment when |
|---|---|
| MAJOR | A change users or integrators must act on — a removed endpoint, a changed account model, a pricing structure change |
| MINOR | A feature ships, backwards compatible |
| PATCH | A fix that changes no interface |

The version lives in `package.json` and is the single source of truth. Update it in the pull
request that ships the change, together with an entry in [`../CHANGELOG.md`](../CHANGELOG.md).

Every push to `main` deploys. There are no release branches and no staging environment: a
change is either on `main` and live, or it is not shipped.

## History

Dates are when the change reached production.

### 2.1.0 — 2026-09-21 — Accounts, sign-in and data model

- **Daily Scrum & Timesheet withdrawn.** The module and its `/timesheet` route are gone; the
  ceremonies are planning poker, retrospectives and the whiteboard.

- **Google and Microsoft sign-in** work end to end. Both `id_token`s are verified server-side
  against provider JWKS.
- **Accounts are scoped per identity provider.** The same address through two providers is two
  accounts, each with its own plan.
- **Plans moved onto the account document** — `tier`, `lifetime`, `planGrantedAt`,
  `planExpiresAt`. Granting is a field edit; orders record purchases rather than conferring
  access.
- **One Cosmos container.** Orders, receipts and name reservations joined accounts in `users`;
  the separate `payments` container is retired.
- **Cosmos migrations** with a ledger, applied on start or with `npm run migrate`.
- **Password reset survives a restart** — tokens are stored server-side instead of in process
  memory — and reset mail goes through Resend/SendGrid rather than unconfigured SMTP.
- **Publisher domain verified** with Microsoft (`sprintdeck.in`), with terms and privacy links
  on the consent screen.
- Landing page simplified to sign-in only; guest entry removed.
- Roughly 700 lines of unreachable code removed, including a second unused sign-in stack.
- Test suite 40 → 52.

**Fixes of note**

- The production build had been failing since 1 September; the site was serving raw source and
  browsers refused it. Vite 8 had dropped the object form of `manualChunks`.
- `VITE_*` secrets were attached to the deploy step rather than the build step, so no client id
  or payment identifier ever reached the bundle.
- A `Cross-Origin-Opener-Policy` header on the OAuth callback severed `window.opener`, so the
  sign-in popup could never hand its token back.
- Microsoft token verification passed a PEM string where a key object was required and pinned
  the issuer to a literal tenant, so it could not have succeeded.
- An undeclared variable in the OAuth handler threw under `'use strict'`, returning an empty
  500 after an otherwise successful sign-in. The API had been excluded from linting, which is
  why it went unnoticed; it is now linted.

### 2.0.0 — 2026-07 — Enterprise edition

Subscriptions with three tiers, UPI payment without a gateway, retrospectives, whiteboard,
daily scrum and timesheet capture, Linear integration, GDPR export and deletion. See
[`../CHANGELOG.md`](../CHANGELOG.md) for the daily log of that period.

### 1.x — Planning poker

The original SprintDeck: real-time planning poker, guest rooms, no accounts.

## Release checklist

1. `npm run lint` — zero errors
2. `npm test` — all green
3. `npm run build` — succeeds
4. Version bumped in `package.json`, entry added to `CHANGELOG.md` and above
5. Merge to `main`; watch the Actions run to completion
6. Verify on production: sign in, start a room, and check `/api/auth/oauth-status`
7. If the release touches Cosmos, run `npm run migrate` before or immediately after the deploy

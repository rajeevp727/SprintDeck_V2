# Security

## Reporting a vulnerability

Email **security@sprintdeck.in** (or the address on https://sprintdeck.in). Please include
what you did, what happened, and what you expected. Do not open a public issue for a
vulnerability, and do not test against other people's rooms or accounts.

Expect an acknowledgement within 3 working days. We will tell you when a fix ships and credit
you if you would like that.

## Controls in place

| Area | Control |
|---|---|
| Passwords | scrypt with a 16-byte per-user random salt; constant-time comparison |
| Sessions | HS256 JWT signed with `JWT_SECRET`; expiry enforced; constant-time signature compare |
| OAuth | Google and Microsoft `id_token` verified server-side against provider JWKS, audience pinned to this application's client id |
| Password reset | 32 random bytes, single use, stored server-side with a 30-minute lifetime |
| Transport | HTTPS only; HSTS with preload |
| Browser | Content-Security-Policy with no `unsafe-inline` in `script-src`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'` |
| Payment ingest | Shared-secret authentication with a constant-time hashed comparison; refuses to run when the secret is unset |
| Database | Every query with user input is parameterised |
| Secrets | Held in GitHub secrets and Azure application settings; none committed |
| Dependencies | Dependabot updates; Aikido scanning in CI |

## Known limitations

Stated plainly, because a security document that claims everything is fine is not useful:

- **The publisher is not verified with Microsoft.** Consent screens show "unverified" until a
  verified Microsoft Partner Center account exists.
- **OAuth uses the implicit `id_token` flow.** Tokens are verified server-side, but
  authorization code with PKCE is the current standard and is the intended destination.
- **Sessions cannot be revoked.** A JWT is valid until it expires; changing a password does
  not end existing sessions.

An internal review of authorization, payment integrity and data handling was carried out on
2026-09-21 and produced findings that are being worked through before general availability.
Those findings are tracked privately rather than in this repository, which is public.

## Incident response

Severity levels, containment steps, notification clocks (72 hours to an EU supervisory
authority, 48 hours to business customers) and the contact aliases are in
[RESILIENCE.md](RESILIENCE.md#incident-response).

## Handling of personal data

| Data | Why it is held | Where |
|---|---|---|
| Email address | Account identity, sign-in, receipts | Cosmos `users` |
| Display name | Shown to others in a room | Cosmos `users` and ceremony documents |
| Password hash and salt | Sign-in, for password accounts | Cosmos `users` |
| Provider subject id | Matching a returning OAuth user | Cosmos `users` |
| Order and payment records | Proof of purchase, reconciliation | Cosmos `users` |
| Room content — votes, notes, drawings, chat | The product itself | Cosmos ceremony containers |

Payment card data is never handled: payment is a direct UPI transfer, and the service only
sees a bank credit notification.

Users can export their account data and delete their account from **Account settings**
(`GET /api/auth/export`, `POST /api/auth/delete`). The export covers the account, its plan and
its orders; deletion removes the account and strips the personal fields from its orders,
keeping the amounts that tax rules require.

Full processing records, lawful bases, retention and transfer mechanisms are in
[COMPLIANCE.md](COMPLIANCE.md).

## Reviewing this document

Review on every release that touches authentication, payments or stored data, and at least
quarterly. Last reviewed: 2026-09-21.

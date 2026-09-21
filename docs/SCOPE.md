# Project scope

## Purpose

SprintDeck Enterprise gives a distributed agile team one place to run its ceremonies — sprint
planning, retrospectives and a shared whiteboard — in real time, without
a per-seat licence for each of those tools separately.

## Users

| Who | What they need |
|---|---|
| Scrum master / facilitator | Start a room, control reveal and consensus, keep the session moving |
| Engineer | Join from a link, vote, contribute notes, draw |
| Team lead buying the tool | A plan that covers the team, paid in INR without a card |
| Owner / operator | Grant plans, reconcile payments, keep the service running |

## In scope

**Ceremonies**
- Planning poker: rooms, hidden votes, reveal, consensus, story queue
- Retrospective boards: columns, notes, review of last sprint's actions
- Whiteboard: shared canvas, live multiplayer, presenter write-control, share links

**Accounts and access**
- Email + password with scrypt hashing and one-time password reset links
- Google and Microsoft sign-in
- Accounts scoped per identity provider
- Self-service data export and account deletion

**Commercial**
- Three paid tiers, ₹199 / ₹499 / ₹999
- Retrospectives and in-room chat need **Pro** or above; the whiteboard needs **Expert** or
  above. The tier is read from the signed-in account, server-side
- UPI payment without a gateway, reconciled from bank credit notifications
- Lifetime plans for allowlisted addresses
- Manual plan grants for support and sales cases

**Integrations**
- Linear: import estimation tickets, push agreed points back (customer-supplied API key)

## Out of scope

Deliberate exclusions, not omissions:

| Not built | Why |
|---|---|
| Payment gateway (Razorpay, Stripe) | Per-transaction fees rejected; UPI direct transfer chosen instead |
| Per-seat billing and team management | Plans attach to an account, not an organisation |
| Jira and Azure DevOps integrations | Linear first; the others follow demand |
| Mobile applications | The web app is responsive; no native client planned |
| SSO for enterprise directories (SAML, SCIM) | Requires a plan tier and a buyer that does not exist yet |
| Self-hosting | Single hosted deployment only |
| Audit logging and compliance reporting | Would be needed for an enterprise procurement process; nothing is built |

## Known gaps

Honest statements of things that are built but incomplete, as of 2026-09-21:

- **OAuth uses the implicit `id_token` flow.** It works and is verified server-side against
  provider JWKS, but authorization code + PKCE is the current standard and both providers
  discourage implicit. Migrating is a change across the frontend and API.
- **The publisher is unverified with Microsoft.** Consent screens show "unverified". Removing
  that needs a verified Microsoft Partner Center account, which needs a registered business.
- **The migration runner's on-start hook is unproven in production.** Use `npm run migrate`.
- **Payment reconciliation is amount-matching.** Two orders for the same tier at the same paise
  suffix cannot exist simultaneously by construction, but the design depends on the bank
  notification pipeline being trustworthy and timely.
- **No cookie-consent banner is mounted.** Required before marketing to EU users.
- **Whiteboard modules exceed the complexity budget** the project's own lint rules set
  (`Whiteboard` 580 lines, `elementsToSvg` complexity 49). They work; they are hard to change
  safely.

## Planned

Ordered by the value they unlock, not by effort:

1. Authorization code + PKCE for both providers
2. Publisher verification with Microsoft
3. Cookie consent, before any EU marketing
4. Team plans — one purchase covering several accounts
5. Jira integration

## Success measures

The product is working when a team can run a full sprint's ceremonies without leaving it: a
planning session that ends with points written back to the tracker, a retrospective whose
actions are reviewed in the next one, and a whiteboard that survives the meeting.

# SprintDeck Enterprise (V2) — Product Requirements

_Living document. Update alongside `CHANGELOG.md` as the product evolves._
_Last updated: 2026-07-06._

## 1. Vision
SprintDeck V2 is an **integrations hub for sprint estimation**. Teams run planning
poker as usual, but V2 connects to the team's **project management tool**, pulls the
tickets that need estimating, and **writes the agreed story points straight back** —
closing the loop between estimation and the backlog.

## 2. Positioning
| | Product | URL | Model |
|---|---|---|---|
| **V1** | Plain planning poker (no integrations) | `sprintdeck.rajeevstech.in` | **Free** |
| **V2** | Integrations hub (this repo) | `sprintdeckv2.rajeevstech.in` | **Paid** (see §7) |

## 3. Target users
Agile/scrum teams (esp. engineering) who plan sprints and track work in Linear,
Jira, or Azure DevOps and want estimates synced without manual copying.

## 4. Core user journey
1. Moderator creates a room; team joins via code/link (no login).
2. Moderator clicks **Connect a project management tool** → picks Linear / Jira / ADO.
3. Pastes a **read/write API key** → the tool's **estimation view** loads into the queue.
4. Team votes on each ticket (hidden until reveal).
5. On reveal, moderator confirms the agreed value → **pushed back** to the ticket's estimate.
6. Estimated tickets grey out with their points; repeat until done.

## 5. Scope
**In scope (current — mock/preview):** connect picker, per-tool key entry, load
sample estimation tickets, vote/reveal, confirm & (simulated) push-back, manual
tasks, results history/export, light/dark theme.

**In scope (planned real):** live Linear read/write (T1); Jira + Azure DevOps via a
shared provider adapter (T10); cross-sprint velocity analytics (T9).

**Out of scope (explicit decisions):**
- **No authentication / accounts / SSO / RBAC** — the app stays open/anonymous.
- No Stripe — payments via **PhonePe UPI** (§7).

## 6. Non-goals / known tradeoffs
- Because there's **no auth**, paid access can't be technically enforced per user
  yet — gating is manual/honor-based until a light identity + PSP is added.
- Rooms are ephemeral (Cosmos TTL: 2h idle / 5h max) — not a system of record (T3).

## 7. Monetization
- **PhonePe UPI**, not Stripe. UPI VPA stored as a GitHub secret (out of repo),
  injected at build. UPI has **no automated payment confirmation**, so tier gating
  is manual for now.
- Planned tiers (TBD scope/price): **Pro / Expert / Master**.

## 8. Roadmap (execute one at a time, on explicit approval)
| ID | Item | Status |
|---|---|---|
| T1 | Real Linear integration (live fetch + write-back) | **blocked** — needs OAuth app / org re-enabling API keys |
| T2 | Automated tests (unit + e2e in CI) | pending |
| T3 | Persistence policy (retention/export/delete/backups) | pending |
| T4 | Security hardening (rate limit, headers, scanning) | pending |
| T5 | Observability & ops (error tracking, alerts, staging) | pending |
| T6 | Legal & compliance (ToS, DPA, security page) | pending |
| T7 | Monetization (PhonePe UPI, tiers) | pending |
| T8 | Accessibility & polish (WCAG AA, real icons) | pending |
| T9 | Differentiation (velocity/estimation analytics) | pending |
| T10 | Additional integrations (Jira, Azure DevOps) | pending |

_(Full detail + report-card grades tracked in the assistant's project memory.)_

## 9. Risks
- Headline value (real tool sync) is **mocked** until T1 — and T1 is externally
  blocked (org disabled personal API keys; OAuth app not registered).
- Differentiation is thin (estimate write-back is easily copied) until T9.
- Runs on personal GitHub + Azure accounts (key-person risk).

## 10. Success signals (draft)
- Teams connect a tool and complete a full sprint's estimation with points written back.
- Repeat usage across sprints; multiple tools connected.

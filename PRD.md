# SprintDeck — Product Requirements & Current State

_Living product document. Keep this file aligned with README.md, CONTEXT.md and CHANGELOG.md._
_Last reconciled: 2026-11-27._

## 1. Product vision

SprintDeck is an **Agile Ceremony & Team Intelligence Platform** for software teams. It complements project-management systems rather than replacing them.

Its four product pillars are:
1. **Estimate** — Planning Poker and estimation workflows.
2. **Improve** — sprint retrospectives and accountable action items.
3. **Collaborate** — team chat and shared whiteboard.
4. **Understand** — cross-sprint trends and team-level insights.

The product's long-term value should come from connecting these workflows and helping teams learn from one sprint to the next.

## 2. Target customers and users

- Primary buyer: CTO, VP Engineering, Engineering Manager or delivery leader.
- Daily champion: Scrum Master, Agile Coach or team lead.
- Daily users: software engineers and other ceremony participants.
- Initial target: small and mid-sized engineering teams that already use a project-management system and want better ceremony workflows.

## 3. Current product capabilities (repository-level assessment)

- Planning Poker rooms: create/join, hidden voting, reveal, estimation history and exports.
- Project management integration: Linear issue lookup by supplied identifiers and estimate write-back are implemented in the API path when a real Linear issue is attached.
- Important Linear limitation: the separate estimation-view import endpoint currently loads a hard-coded sample dataset with mock issue IDs. Mock IDs are not written back. Do not market that sample import as a live Linear backlog integration.
- Jira and Azure DevOps: visible in the product connection experience, but documented as preview/scaffolded; not ready to be represented as working production integrations.
- Retrospectives: boards, notes, voting, review/action-item ledger operations and exports exist. The current branch adds facilitator-managed action owner, due date, priority and status fields, preserves unfinished commitments when a retrospective ends, and drops completed commitments from the next sprint's carry-forward list. Assignment is currently to a participant in the active retrospective; stable organisation-member assignment remains dependent on the future workspace/membership model.
- Whiteboard: shared board operations exist. Validate collaboration consistency, retention and performance at realistic usage before positioning it as a Miro replacement.
- Team chat: available as a paid capability in the current product.
- Accounts: email/password and Google/Microsoft sign-in code exists. Account identity is distinct from per-room participant identity. Organisation membership and multi-team administration are not yet established as product capabilities.
- Payments: UPI order creation, bank-credit ingestion and subscription status code exists. Production readiness still requires an end-to-end audit of account binding, payment matching, expiry/renewal, refunds and support operations.

This section describes code observed in the repository; it is not a claim that every workflow has passed production acceptance testing.

## 4. Positioning

**SprintDeck helps engineering teams run better sprint ceremonies and turn the outcomes into measurable continuous improvement.**

It should integrate with Jira, Linear and Azure DevOps where technically supported, not attempt to replace their issue tracking, backlog or delivery management.

## 5. Product requirements

### 5.1 Planning Poker
- Create and join estimation sessions.
- Hide votes until reveal.
- Support moderator controls and configurable estimation decks.
- Preserve estimation history and session analytics.
- Clearly distinguish manually entered work, real provider-linked issues and sample/demo data.
- Never show a successful provider write-back unless the provider confirms it.

### 5.2 Retrospectives
- Facilitate notes, grouping, voting and review.
- Convert selected discussion outcomes into action items.
- Each action item supports participant owner, due date, priority, status, comments and status/completion history.
- Unfinished actions carry forward with their metadata; completed actions remain in archived sprint metrics but are not re-opened.
- Carry incomplete actions into the next retrospective.
- Show team-level action completion trends without turning them into individual performance scores.

### 5.3 Organisation and teams (initial implementation on `CTO-business-coach`)
- An organisation can contain multiple teams.
- Users can belong to one or more organisations/teams.
- Roles: organisation owner/admin, team lead or Scrum Master, member and read-only stakeholder.
- Invitations must expire and be single-use.
- Organisation-level billing and plan entitlements.
- Every organisation-scoped API operation must authorise membership server-side; never trust a client-supplied tenant ID.

### 5.4 Sprint intelligence (initial implementation)
- Cross-sprint estimation trends, consensus and spread.
- Ceremony participation and attendance trends.
- Retrospective action completion and carry-forward.
- Team-level insights with context and caveats.
- Do not use story points as an individual productivity or employee ranking metric.

### 5.5 Integrations
- Linear: validate both identifier-based lookup and confirmed estimate write-back with a real test workspace.
- Linear sample estimation import must be clearly labelled as sample/demo until it is replaced by a real provider query.
- Jira and Azure DevOps remain preview until secure credential handling, provider API behaviour, permissions, error handling and automated integration tests are complete.
- Never expose provider API keys to browser code or logs.

## 6. Monetisation and account entitlements

The repository contains UPI order creation, payment-credit ingestion and subscription-status code. Treat subscription functionality as **implemented but requiring production validation**, not automatically production-proven.

Before commercial launch, validate:
- Every order is bound to the correct authenticated account where applicable.
- Duplicate UTRs cannot confirm multiple orders.
- Ambiguous same-amount payments are safely handled and escalated rather than silently assigned to the wrong customer.
- Plan duration, expiry, renewal, upgrades, downgrades and cancellation are explicit.
- Refunds, failed payments and support escalation have documented processes.
- Server-side entitlements are consistently enforced by every paid API endpoint.

Current plan labels and displayed prices are maintained in the application; validate their exact entitlements and commercial suitability with customers before treating them as final pricing.

## 7. Roadmap

| Priority | Workstream | Exit condition |
|---|---|---|
| P0 | Documentation and acceptance baseline | Docs match code; critical journeys have repeatable acceptance tests |
| P0 | Auth, membership and entitlement audit | Negative and cross-account access tests pass |
| P0 | Linear integration verification | Real issue lookup and confirmed write-back pass against a test workspace |
| P0 | Payment lifecycle audit | Correct account activation, duplicate handling, expiry and support paths verified |
| P1 | Organisation and team management | **Initial implementation on `CTO-business-coach`** — org/team creation, membership, invitations, role assignment and active team context; email delivery, removals, billing and migration remain open |
| P1 | Retrospective action ownership | **Initial implementation on `CTO-business-coach`** — owner, due date, priority, status, comments, status history and incomplete carry-forward; owners are still board participants, not durable workspace identities |
| P1 | Cross-sprint team analytics | **Initial retrospective metrics implemented** — Poker analytics and deeper trends remain open |
| P2 | Microsoft Teams notifications | Users can launch/join ceremonies from notifications |
| P2 | Jira and Azure DevOps | Provider integrations pass security and end-to-end tests |
| P3 | Enterprise controls | SSO policy, audit logs, retention and security review complete |

Detailed execution plan: `docs/CTO-IMPLEMENTATION-PLAN.md`.\n\n### 5.6 Onboarding and Scrum Coach\n- Dashboard onboarding checklist guides organisation setup, invitation, first planning session and first retrospective.\n- Scrum Coach is read-only and never mutates records. Configure `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` and optionally `AZURE_OPENAI_API_VERSION` to enable generated suggestions. Without these settings it provides rule-based prompts and clearly identifies them as such.

## 8. Success metrics

Measure customer value and retention, not feature count:
- Activation: percentage of new teams completing their first ceremony.
- Time to first value: time from sign-up to completed ceremony.
- Team adoption: invited members who participate.
- Repeat usage: teams completing ceremonies in consecutive sprints.
- Retrospective follow-through: action items completed by their due date.
- Retention: teams active after 4, 8 and 12 weeks.
- Commercial conversion: pilot teams converting to paid plans.
- Reliability: ceremony completion success, API error rate and payment reconciliation exceptions.

Do not claim time or cost savings until measured against a baseline with actual customer teams.

## 9. Delivery guardrails

- Develop on `CTO-business-coach`; do not merge to `main` without explicit owner approval.
- Every feature requires a defined customer problem, acceptance criteria, tests and documentation.
- No production secret or production deployment changes without explicit approval.
- Maintain a changelog entry for shipped work.

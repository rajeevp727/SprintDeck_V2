# SprintDeck CTO Business-Coach Workstream

Branch: `CTO-business-coach`  
Base: `main`  
Status: active development; **never merge to main without explicit owner approval**.

## Product direction

SprintDeck should become an Agile Ceremony & Team Intelligence Platform, complementing rather than replacing Jira, Linear, or Azure DevOps.

Core pillars:
1. Estimate — Planning Poker and issue estimation.
2. Improve — retrospectives with accountable action items.
3. Collaborate — team chat and shared whiteboard.
4. Understand — cross-sprint trends and team-level insights.

## Repository findings verified during this work

- The app has email/password and Google/Microsoft sign-in flows. Room participants still have a separate room identity; do not confuse account authentication with organisation membership.
- Planning Poker rooms use short polling (1.5 seconds) in the current Room component.
- Linear supports issue lookup by supplied identifiers and estimate write-back when a real Linear ID is attached. The separate “import estimation view” endpoint still loads a hard-coded sample dataset with mock IDs. Mock IDs are deliberately not written back.
- Jira and Azure DevOps appear in the connection UI, but the README documents them as preview/scaffolded.
- Retrospective boards support notes, voting, review/action-item ledger operations and export. A persistent, cross-sprint accountable action-management workflow still needs validation and product work.
- Whiteboard supports shared board operations; validate real-time consistency and persistence before marketing it as equivalent to a full Miro replacement.
- Subscription orders and bank-credit ingestion exist in the codebase. Validate account ownership, UTR matching edge cases, plan expiry/renewal, refunds and support workflows before treating payments as production-ready.
- The docs have drifted: README, PRD, CHANGELOG and CONTEXT describe different generations of the app. This workstream must keep them aligned.

## Delivery principles

- All work happens on this branch.
- Never merge, rebase into, or push commits to `main`.
- Prefer small, reviewable commits.
- Do not claim a feature is production-ready until its API, UI, persistence, permissions, error paths and automated tests have been verified.
- No production deployment or production-secret changes without explicit approval.
- Every feature needs a customer problem, acceptance criteria, instrumentation and rollback plan.

## Prioritised roadmap

### P0 — Trust and product foundation
- Reconcile product documentation with the current code.
- Build a repeatable acceptance-test checklist for authentication, room lifecycle, voting, retrospectives, whiteboard, chat, Linear import/write-back and subscriptions.
- Validate authorisation boundaries: moderator-only actions, account ownership, subscription entitlement and room/board membership.
- Verify Cosmos persistence, TTL/retention, backup and restore behaviour.
- Add production health/usage signals and actionable error monitoring.
- Confirm the payment lifecycle: order creation, unique UTR handling, ambiguous same-amount payments, expiry, account entitlement, renewal and refund/support process.

### P1 — Multi-team product
- Organisation workspace model: organisation, membership, role, team and invitation.
- Roles: organisation owner/admin, team lead/Scrum Master, member, read-only stakeholder.
- Team management and team switcher.
- Organisation-level billing and entitlements.
- Cross-sprint ceremony history scoped to team and organisation.
- Retrospective action items with owner, due date, status, comments, carry-forward and completion history.
- Team-level analytics: ceremony participation, estimation spread/consensus and action-item completion. Avoid using story points as an individual productivity score.

### P2 — Adoption and distribution
- Custom decks, anonymous voting option, configurable timer and moderator controls.
- Teams notifications and deep links.
- **Initial onboarding checklist delivered** for workspace creation, invitation, Planning Poker and retrospective. A seeded sample workspace and automatic ceremony-completion detection remain open.
- Jira and Azure DevOps only after provider-specific integration tests and secure credential storage.
- Workspace export, audit log and configurable retention.

### P3 — Enterprise readiness
- SSO enforcement, MFA policy, granular RBAC, audit trail, data processing documentation, support/SLA and security review.

## Organisation data model (initial implementation)

- Organisation: id, name, slug, plan, createdAt, status.
- Membership: id, organisationId, userId, role, status, invitedBy, joinedAt.
- Team: id, organisationId, name, timezone, createdAt, archivedAt.
- TeamMembership: id, teamId, userId, role, joinedAt.
- Invitation: id, organisationId, email, role, tokenHash, expiresAt, acceptedAt, invitedBy.
- Ceremony: existing poker/retro/whiteboard entity plus organisationId/teamId/createdBy where appropriate.
- AuditEvent: organisationId, actorUserId, action, resourceType, resourceId, timestamp, metadata with secrets and sensitive payloads excluded.

The initial organisation container uses organisation ID as its partition key and stores members, teams, invitations and a bounded audit-event list in the organisation document. Existing standalone rooms and accounts are not migrated. Retrospectives can opt into an organisation/team when created; only these new linked archives appear in workspace analytics. Every implemented organisation-scoped API derives the caller from the authenticated session and checks membership server-side. Further tenant partitioning, account migration and data export/restore validation remain required.

## Acceptance gates

A release is not complete until:
- TypeScript build succeeds.
- Lint succeeds.
- Unit tests succeed.
- New API tests cover success, unauthorised, forbidden, not found, validation and persistence failure paths.
- End-to-end tests cover the primary customer journey.
- No secrets or personal payment/bank data are exposed in logs.
- Documentation and changelog are updated.
- The change is reviewed on this branch; main remains untouched.


## Delivery update — 2026-11-27

Implemented on `CTO-business-coach`:
- Retrospective action assignment, due date, priority, status, comments, status history and incomplete carry-forward.
- Team goals/OKRs with target, progress, unit, due date and active/at-risk/completed lifecycle.
- Organisation and team creation, membership invitations, role assignment and team membership assignment.
- Active team context for new retrospectives.
- Team-scoped retrospective analytics and a read-only Scrum Coach endpoint. Azure OpenAI requires explicit app settings; rule-based guidance is returned when the service is not configured.
- First-sprint onboarding checklist.
- Branch-push validation workflow.

Still open before a commercial pilot:
- Execute and pass the full lint, unit, coverage and production build pipeline.
- Invitation email delivery and member removal/team archive workflows.
- Stable workspace-member identity for retrospective action assignees.
- Poker estimation history linked to team context and broader sprint analytics.
- Organisation billing/entitlements, payment lifecycle audit and production security review.
- AI provider configuration and end-to-end validation.
- Customer pilots and pricing validation.

Linear, Jira and Azure DevOps integrations remain explicitly deferred. No production deployment or merge to `main` is authorised by this workstream.

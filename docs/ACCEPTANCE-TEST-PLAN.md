# SprintDeck Release Acceptance Test Plan

Use this checklist for staging and production-readiness reviews. Record environment, build SHA, tester, date and evidence for each run. A passing unit-test suite alone is not sufficient.

## A. Authentication and account isolation
- [ ] Register with valid email/password.
- [ ] Reject invalid email, short password, duplicate email and duplicate username.
- [ ] Sign in and sign out; verify revoked device sessions are rejected.
- [ ] Verify Google and Microsoft sign-in state/nonce validation.
- [ ] Verify password reset token is single-use and expires.
- [ ] User A cannot read or mutate User B's account data, orders or subscription.
- [ ] A client-supplied account or future organisation ID cannot grant access.

## B. Planning Poker
- [ ] Create a room; join from a second browser/device.
- [ ] Verify participant presence and reconnect after network interruption.
- [ ] Verify moderator-only operations reject a non-moderator.
- [ ] Verify votes remain hidden until reveal.
- [ ] Verify moderator cannot vote if that is the intended product rule.
- [ ] Reset, advance, remove participant and end room.
- [ ] Verify expired/deleted rooms are handled without data leakage.
- [ ] Verify export data is correct and does not expose hidden votes prematurely.

## C. Linear integration
- [ ] Import known issue identifiers from a test Linear workspace.
- [ ] Unknown and malformed identifiers are reported clearly.
- [ ] Confirm imported issue title, identifier and current estimate.
- [ ] Estimate and confirm a story; verify Linear actually stores the new estimate.
- [ ] Provider outage, invalid key and insufficient permissions show actionable errors.
- [ ] Confirm sample/demo issues are explicitly labelled and cannot be mistaken for live provider records.
- [ ] Confirm no API key is sent to the browser or written to logs.

## D. Retrospective
- [ ] Create and join a board with authorised participants.
- [ ] Add, edit, move, vote on and delete notes.
- [ ] Verify facilitator-only actions reject other participants.
- [ ] End a board and verify it becomes read-only.
- [ ] Verify review/action-item ledger, export and history.
- [ ] Test concurrent edits and reconnect behaviour.
- [ ] Verify retention and deletion policy.

## E. Organisation workspaces, teams and goals
- [ ] Create an organisation; verify creator becomes owner.
- [ ] Create multiple teams and switch the active team context.
- [ ] Invite a user; reject invalid email, duplicate active member, expired token and token reuse.
- [ ] Accept an invitation only from the invited email account.
- [ ] Verify non-members cannot read organisation data or create teams.
- [ ] Verify only owner can grant organisation admin; admins cannot self-promote.
- [ ] Verify team leads can manage only their team membership and goals.
- [ ] Verify users cannot join a team unless they are organisation members.
- [ ] Create a measurable team goal; update progress and verify completed state.
- [ ] Verify one organisation cannot read another organisation's analytics or members.
- [ ] Verify invitation tokens are hashed at rest and never returned after acceptance.

## F. Team analytics and Scrum Coach
- [ ] Create and end a retrospective with an active organisation/team selected.
- [ ] Verify archived sprint and action metrics appear only in that team scope.
- [ ] Verify completed actions remain in historical metrics and unfinished actions carry forward.
- [ ] Verify overdue actions are calculated against due dates.
- [ ] Verify Scrum Coach is read-only and does not mutate any board or action record.
- [ ] With Azure OpenAI unconfigured, verify the UI identifies rule-based prompts as non-AI.
- [ ] With Azure OpenAI configured, verify generated suggestions use aggregate metrics only and never expose keys.
- [ ] Verify the UI does not rank individuals or use story points as individual productivity scores.

## G. Whiteboard and chat
- [ ] Create, join, edit, delete and clear board elements.
- [ ] Verify writer permissions and share-link permissions.
- [ ] Test simultaneous users, reconnect and persistence.
- [ ] Verify chat membership, message persistence and access after leaving.
- [ ] Verify paid entitlement is enforced by the server, not only hidden in the UI.

## H. Subscription and payment
- [ ] Create an order for every plan and verify the server-calculated amount.
- [ ] Reject tampered tier/amount and unauthenticated account ownership claims.
- [ ] Confirm a real credit alert activates only the intended order/account.
- [ ] Duplicate UTR does not activate a second order.
- [ ] Same-amount concurrent pending orders are handled safely and deterministically.
- [ ] Debit alerts, malformed alerts and unmatched credits do not activate plans.
- [ ] Expired order cannot later activate unexpectedly.
- [ ] Verify plan expiry, renewal, upgrade/downgrade and cancellation.
- [ ] Verify all paid API endpoints enforce current server-side entitlement.
- [ ] Confirm customer support has a reconciliation and refund procedure.

## I. Release quality
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] API tests cover validation, unauthorised, forbidden, not-found and dependency failures.
- [ ] Browser end-to-end test covers a full ceremony with multiple participants.
- [ ] Mobile viewport and keyboard/accessibility smoke tests pass.
- [ ] Monitoring alerts and operational runbook are available.
- [ ] Changelog, PRD and README are aligned.
- [ ] Deployment is staged and approved; no automatic merge to `main`.

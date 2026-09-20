# Data protection and compliance

How SprintDeck handles personal data, and what is in place for the GDPR (EU/UK) and
India's Digital Personal Data Protection Act 2023.

_Reviewed 2026-09-21. Review again whenever the data model changes, and at least yearly._

## Roles

| Context | Our role |
|---|---|
| Someone signs up and uses SprintDeck | **Controller** — we decide what is collected and why |
| A company buys it and their staff use it | **Processor** for the room content, **controller** for the account | 

A business customer acting as controller should sign the [Data Processing Addendum](DPA.md).

## Record of processing (GDPR Article 30)

| Purpose | Data | Lawful basis | Retention | Recipients |
|---|---|---|---|---|
| Account and sign-in | Email, display name, password hash + salt, provider subject id | Contract | Until deletion | Azure (hosting) |
| Ceremony participation | Display name, votes, notes, drawings, chat | Contract | Room expiry (`SESSION_IDLE_HOURS`, `SESSION_MAX_AGE_HOURS`) | Azure, Azure Web PubSub |
| Subscriptions and payment | Email, account id, tier, amount, status, bank reference | Contract; legal obligation for tax records | Order records kept, personal fields removed on deletion | Azure |
| Password reset | Email, one-time token | Contract | 30 minutes | Azure, Resend/SendGrid |
| Advertising (only with consent) | Cookies set by Google AdSense | Consent | Per Google's policy | Google |
| Product telemetry | Error text with emails redacted | Legitimate interests | Log retention of the platform | Azure |

We do not process special-category data, we do not profile, and we take no automated
decisions with legal effect.

## What we never hold

Payment card details. Payment is a direct UPI transfer; the service sees only a bank credit
notification. No card number, CVV or bank credential reaches our systems.

## Data subject rights

| Right | How it is served |
|---|---|
| Access / portability (Art. 15, 20) | **Account settings → Download your data** — `GET /api/auth/export` returns the account, its plan and its orders as JSON |
| Erasure (Art. 17) | **Account settings → Delete account** — `POST /api/auth/delete` removes the account document and strips the personal fields from its orders |
| Rectification (Art. 16) | Display name is editable in Account settings; email changes on request |
| Objection / restriction | On request to the contact address |
| Withdraw consent | The cookie banner choice can be changed at any time |

**What deletion leaves behind, deliberately:** order records keep their amount, tier and
timestamps with the email and account id removed. Indian tax rules require retention of
financial records; the surviving row cannot be tied back to a person.

**What deletion does not yet reach:** display names inside rooms that have not expired
(retro notes, chat, whiteboard elements). Those age out with the room. A request to purge
them sooner is handled manually.

## Consent

A banner asks before any non-essential cookie is set. Essential local storage — the session
token, room identity, layout preference — is used without consent as it is strictly necessary
to provide the service the person asked for. Advertising scripts load only after acceptance,
and the choice plus its timestamp are stored locally.

## International transfers

The service runs in Azure and is operated from India, so personal data of EU/UK users leaves
the EEA.

- **Mechanism:** Standard Contractual Clauses (2021/914) are the basis on which an EU
  controller may use us; they are incorporated into the [DPA](DPA.md).
- **Sub-processors:** Microsoft Azure (hosting, database), Azure Web PubSub (real-time),
  Resend or SendGrid (transactional email), Google AdSense (advertising, only with consent).
- **Action outstanding:** confirm and record the Azure region the Cosmos account and Static
  Web App run in, and publish it here. A transfer impact assessment should accompany the SCCs
  before onboarding an EU business customer.

## India — DPDP Act 2023

The Act applies to us as an Indian operator processing digital personal data.

| Obligation | Status |
|---|---|
| Notice of purpose at collection | Privacy policy — ✅ |
| Consent, freely given and withdrawable | Cookie banner and account settings — ✅ |
| Purpose limitation and data minimisation | Only what the features need — ✅ |
| Accuracy and correction | Editable profile — ✅ |
| Erasure on withdrawal of consent | Account deletion — ✅ |
| Reasonable security safeguards | See [SECURITY.md](SECURITY.md) — ⚠️ remediation in progress |
| Breach notification to the Data Protection Board and affected people | Process defined in [SECURITY.md](SECURITY.md#incident-response) — ⚠️ untested |
| Grievance redressal mechanism and contact | ⚠️ publish a named contact and response time |
| Consent manager registration | Not applicable at this scale |

Two items remain: a named grievance contact on the site, and a breach-notification drill.

## Sub-processor changes

Adding or replacing a sub-processor requires updating this page and the DPA, and giving
business customers notice before the change takes effect.

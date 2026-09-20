# Data Processing Addendum

**Template.** Offer this to a business customer whose staff use SprintDeck, where they are the
controller of their people's data and we process it on their instructions.

> This is a starting point drafted from the GDPR's requirements, not legal advice. Have a
> lawyer review it before signing your first enterprise contract, and expect a large customer
> to send their own paper instead.

---

**Data Processing Addendum to the SprintDeck Terms of Service**

Between **the Customer** (the "Controller") and **[legal entity name], [address], India**
("SprintDeck", the "Processor"). Effective on the date the Customer accepts the Terms of
Service or signs this Addendum.

## 1. Subject matter and duration

SprintDeck processes personal data on the Controller's behalf to provide the SprintDeck
service — real-time agile ceremonies, accounts, and subscription management — for as long as
the Controller holds an account, plus the retention periods in §7.

## 2. Nature and purpose

Hosting, storage, transmission and display of the Controller's users' data so they can run
planning sessions, retrospectives, whiteboards and chat, and so their accounts and plans work.

## 3. Categories of data subject

The Controller's employees, contractors and invited guests who use SprintDeck.

## 4. Categories of personal data

Email address; display name; authentication data (password hash and salt, or identity
provider subject id); content the person contributes to a room (votes, notes, drawings,
chat); subscription and payment records; technical data in logs, with email addresses
redacted.

No special categories of data under Article 9 are requested or required.

## 5. Processor obligations

SprintDeck shall:

1. process personal data only on the Controller's documented instructions, including on
   transfers, unless required otherwise by law — in which case it will inform the Controller
   first, unless that law forbids it;
2. ensure persons authorised to process the data are bound by confidentiality;
3. implement the technical and organisational measures in Annex 2;
4. engage sub-processors only under §6;
5. assist the Controller, so far as possible, in answering data subject requests;
6. assist the Controller with Articles 32–36 — security, breach notification, impact
   assessments — taking into account the information available to it;
7. at the Controller's choice, delete or return the personal data at the end of the service,
   subject to the retention in §7;
8. make available the information needed to demonstrate compliance and allow audits under
   §8.

## 6. Sub-processors

The Controller gives general authorisation for the sub-processors listed in Annex 1.
SprintDeck will give at least **30 days' notice** before adding or replacing one, and the
Controller may object on reasonable data-protection grounds; if the objection cannot be
resolved, the Controller may terminate the affected service.

## 7. Deletion and retention

On termination, or on the Controller's request, SprintDeck deletes the account data within
**30 days**. Financial records — order amount, tier, timestamps — are retained as required by
Indian tax law with all personal identifiers removed. Room content expires automatically under
the service's retention windows.

## 8. Audit

SprintDeck will answer the Controller's reasonable written questions about its processing
within 30 days, and will make available any current certifications or third-party assessment
reports. On-site audits are available once per year, at the Controller's cost, on 30 days'
notice, subject to confidentiality.

## 9. Personal data breach

SprintDeck will notify the Controller **without undue delay and within 48 hours** of becoming
aware of a personal data breach affecting the Controller's data, with the nature of the
breach, the categories and approximate number of people and records affected, the likely
consequences, and the measures taken.

## 10. International transfers

Processing takes place in India and in the Microsoft Azure regions in Annex 1. The parties
incorporate the **Standard Contractual Clauses (Commission Implementing Decision (EU)
2021/914), Module Two (controller to processor)**, with:

- Clause 7 (docking): applicable
- Clause 9: Option 2, general written authorisation, 30 days' notice
- Clause 11: the optional redress body is not used
- Clause 17: governed by the law of Ireland
- Clause 18: courts of Ireland
- Annex I, II and III: as set out below

For UK transfers, the **UK International Data Transfer Addendum** applies to the SCCs.

## 11. Order of precedence

Where this Addendum conflicts with the Terms of Service, this Addendum prevails for matters
of personal data.

---

## Annex 1 — Sub-processors

| Sub-processor | Purpose | Location |
|---|---|---|
| Microsoft Azure | Hosting, database, real-time messaging | [record the region] |
| Resend or SendGrid | Transactional email | EU / US |
| Google AdSense | Advertising, only where the end user consents | Global |

## Annex 2 — Technical and organisational measures

- Encryption in transit (TLS 1.2+, HSTS with preload); encryption at rest through Azure
  platform encryption
- Passwords hashed with scrypt and a per-user random salt; never stored or logged in clear
- Authentication by signed tokens with expiry; identity-provider tokens verified against
  provider JWKS
- Access to production data restricted to the operator's own accounts
- Content-Security-Policy, `frame-ancestors 'none'`, and no inline script
- Per-route request rate limiting
- Continuous backup at the database platform level
- Automated dependency updates and static security scanning in CI
- Documented incident response with a 48-hour customer notification commitment

## Annex 3 — Competent supervisory authority

Determined by the Controller's place of establishment.

---

**Signatures**

| | Controller | Processor |
|---|---|---|
| Name | | |
| Title | | |
| Date | | |

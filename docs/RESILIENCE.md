# Resilience, incidents and assurance

Backups, what to do when something goes wrong, and when certification is worth paying for.

_Reviewed 2026-09-21._

## Backups

Azure Cosmos DB continuous backup operates at the account level and supports point-in-time
restore within its retention window.

**A backup nobody has restored is a hope, not a backup.** Rehearse it:

### Restore drill — run quarterly, 30 minutes

1. Cosmos account → **Point In Time Restore**
2. Restore to a timestamp ~1 hour ago, into a **new** account named `sprintdeck-restore-test`
3. Open Data Explorer on the restored account and confirm the `users` container holds
   accounts, orders and name reservations
4. Note how long the restore took — that figure is your real recovery time
5. **Delete the restored account** (it bills separately)
6. Record the date, the duration and anything surprising in the table below

| Date | Restore time | Outcome | Notes |
|---|---|---|---|
| _(not yet run)_ | | | |

### What is not backed up

- **Azure application settings** — the connection string, JWT secret and client ids. Losing
  them means the service cannot start even with intact data. Keep a copy in a password
  manager.
- **DNS records** — the custom domain, DKIM, DMARC and BIMI entries live at GoDaddy. Export
  the zone file and keep it with the settings.
- The site itself needs no backup: it is rebuilt from this repository.

### Recovery objectives

| | Target | Actual |
|---|---|---|
| Recovery point (data loss) | < 5 minutes | continuous backup supports it; unverified |
| Recovery time (service restored) | < 4 hours | unknown until the drill runs |

## Incident response

### Severity

| | Meaning | Examples |
|---|---|---|
| **SEV1** | Service down, or personal data exposed | Site unreachable, database compromised, accounts accessible to strangers |
| **SEV2** | A major feature is broken for everyone | Sign-in failing, payments not confirming |
| **SEV3** | Degraded or affecting a few people | One room broken, email delayed |

### Steps

1. **Declare.** Note the time and the severity. Everything after this is written down as it
   happens — reconstructing a timeline afterwards never works.
2. **Contain.** Stop the harm before finding the cause: revoke a key, disable a route, roll
   back the deployment (re-run the last good Actions run).
3. **Assess personal data.** Was any accessed or exposed? What categories, roughly how many
   people? This determines the clock in the next step.
4. **Notify.** See the table below. The clocks are legal obligations, not targets.
5. **Fix**, deploy, and confirm on production.
6. **Write it up within a week** — timeline, cause, what was affected, what changes so it
   cannot recur. No blame; the system allowed it.

### Notification clocks

| Who | When | Basis |
|---|---|---|
| Affected users | Without undue delay where there is high risk to them | GDPR Art. 34 |
| EU supervisory authority | **72 hours** from becoming aware | GDPR Art. 33 |
| Data Protection Board of India | Without delay, in the prescribed form | DPDP Act 2023 |
| Business customers | **48 hours** | Our [DPA](DPA.md) §9 |

### Contacts

| Purpose | Address |
|---|---|
| Vulnerability reports | security@sprintdeck.in |
| Privacy and data requests | privacy@sprintdeck.in |
| Support | support@sprintdeck.in |

> **Outstanding:** these aliases must exist and reach a monitored inbox. An address published
> in a security policy that bounces is worse than none.

## Monitoring

What exists, and what is missing.

| | Status |
|---|---|
| Azure Application Insights on the Function App | Available, unused |
| Uptime check on `sprintdeck.in` | ❌ none |
| Error tracking in the browser | ❌ none |
| Alerting to a human | ❌ none — an outage is discovered by a customer |
| Status page | ❌ none |

Minimum before taking paying customers: an uptime check that emails on failure, and alerts on
Function App exceptions. Both are free.

## Certification — when, not whether

| | Cost | Time | Worth it when |
|---|---|---|---|
| **SOC 2 Type I** | ₹8–15 lakh | 3–4 months | A deal requires it in writing |
| **SOC 2 Type II** | ₹15–25 lakh | 12 months observation | Enterprise procurement demands it |
| **ISO 27001** | ₹10–20 lakh | 6–12 months | European or large-enterprise buyers |

None of these is worth starting speculatively. What *is* worth doing now, because it costs
nothing and is what auditors ask for first: keep this document current, run the restore
drill, write incidents up, and keep the dependency scanning that CI already performs.

A security questionnaire from a mid-sized customer can usually be answered from
[SECURITY.md](SECURITY.md), [COMPLIANCE.md](COMPLIANCE.md) and this page. That combination
closes more deals than a certificate does at this stage.

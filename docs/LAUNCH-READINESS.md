# Launch readiness

What has to be true before SprintDeck takes money, first in India and then abroad. Tick items
off here; each has an owner and a real cost.

_Reviewed 2026-09-21._

## Phase 0 — before anyone outside the team uses it

| | Item | Cost | Status |
|---|---|---|---|
| ☐ | Close the four security findings from the 2026-09-21 review (tracked privately) | — | **blocking** |
| ☑ | Cookie consent banner shown before non-essential cookies | — | done |
| ☑ | Data export returns account, plan and orders | — | done |
| ☑ | Account deletion removes the account and de-identifies its orders | — | done |
| ☐ | Support, privacy and security aliases that reach a monitored inbox | — | |
| ☐ | Uptime check and exception alerting | free | |
| ☐ | Run the [restore drill](RESILIENCE.md#restore-drill--run-quarterly-30-minutes) once | — | |

## Phase 1 — selling in India

Deliberately India-first: UPI already works, GST is the only tax regime to satisfy, and
customers can be supported in your own time zone.

| | Item | Cost | Notes |
|---|---|---|---|
| ☐ | Business registration — sole proprietorship is enough to start | ₹0–2,000 | Pvt Ltd only when raising or signing enterprise deals |
| ☐ | **Udyam (MSME) registration** | free | Also halves the trademark fee |
| ☐ | Current account in the business name | ₹0–5,000 | Needed to receive UPI as a business |
| ☐ | **GST registration** | free | See below |
| ☐ | Invoices carrying GSTIN, HSN/SAC 998314, place of supply | — | |
| ☐ | Refund and cancellation policy published | — | |
| ☐ | Team plans — one purchase covering several accounts | dev | Today a team shares one login |
| ☐ | Trademark filing, word + device marks | ₹9,000 | See [SCOPE.md](SCOPE.md) |

### GST — what it costs and how it works

**Registration is free** on the government portal. Professional help, if you want it, runs
₹1,000–3,000.

**When you must register**

| Situation | Threshold |
|---|---|
| Services within India | Turnover above **₹20 lakh** a year (₹10 lakh in special-category states) |
| **Export of services** | No threshold in practice — register before invoicing abroad |

**How to register** — [reg.gst.gov.in](https://reg.gst.gov.in)

1. Part A: PAN, mobile, email → TRN issued
2. Part B: business details, place of business, bank account, SAC **998314** (IT design and
   development services)
3. Upload: PAN, Aadhaar, photograph, proof of address, bank statement or cancelled cheque
4. Aadhaar authentication — skipping it triggers physical verification
5. GSTIN issued, typically in **3–7 working days**

**What you pay afterwards**

| | Rate / cost |
|---|---|
| GST on domestic B2B and B2C sales | **18%** |
| GST on export of services | **0%** — zero-rated, with a LUT |
| Filing (GSTR-1 and GSTR-3B) | Monthly or quarterly under QRMP |
| Accountant, if you use one | ₹1,000–3,000 per month |
| Late filing | ₹50 per day per return |

Note the pricing consequence: ₹199 / ₹499 / ₹999 becomes ₹199 **inclusive** of 18% GST — you
keep ₹168.64 — unless you raise prices or state "+ GST". Decide before you publish prices.

### LUT — so exports stay zero-rated

Without a **Letter of Undertaking** you must pay 18% IGST on foreign sales and claim it back
later, which is cash tied up for months.

| | |
|---|---|
| Cost | **Free** |
| Where | GST portal → Services → User Services → **Furnish LUT** (form GST RFD-11) |
| Validity | One financial year — **re-file every April** |
| Needs | GSTIN, digital signature or EVC, two witnesses |
| Time | Same day, usually instant |

Also useful for exports: an **Import Export Code** ([dgft.gov.in](https://dgft.gov.in), ₹500,
1–2 days), and asking your bank for **FIRCs** on inward remittances — you will need them at
assessment time.

## Phase 2 — selling abroad

Do not start this until Phase 1 is earning.

| | Item | Cost | Notes |
|---|---|---|---|
| ☐ | **Merchant of Record** — Paddle, Lemon Squeezy or FastSpring | ~5% of revenue | They become the seller: cards, EU VAT, UK VAT, US sales tax, invoices, dunning, refunds |
| ☐ | Keep UPI for Indian customers | 0% | Cheaper and familiar; route by country |
| ☐ | Record the Azure region and complete the transfer assessment | — | [COMPLIANCE.md](COMPLIANCE.md#international-transfers) |
| ☐ | [DPA](DPA.md) reviewed by a lawyer | ₹15,000–50,000 | Before the first enterprise customer |
| ☐ | Professional indemnity and cyber insurance | ₹25,000–75,000/yr | Enterprise contracts require it |
| ☐ | Madrid Protocol trademark filings | ₹50,000+ per territory | Only where you have customers |

### Why a Merchant of Record rather than Stripe

Stripe or Razorpay charge 2–3% instead of 5%, but leave you owning tax compliance in every
country you sell into: EU VAT through OSS with quarterly filings, UK VAT, and US sales tax
wherever you cross an economic-nexus threshold. For a solo operator that is a part-time job
and a real audit risk. An MoR sells as the merchant and carries that obligation; the extra
2–3% is cheaper than the accountant it replaces.

Revisit when foreign revenue passes roughly ₹50 lakh a year, where the fee difference starts
to fund proper tax advice.

## Phase 3 — enterprise

Only when a deal asks for it: SOC 2 or ISO 27001 ([RESILIENCE.md](RESILIENCE.md#certification--when-not-whether)),
SSO with SAML/SCIM, an uptime SLA, audit logging, and a signed vendor security questionnaire.

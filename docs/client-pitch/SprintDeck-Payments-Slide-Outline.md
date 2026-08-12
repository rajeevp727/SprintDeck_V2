# SprintDeck Payments — Slide Outline

**Talk track:** Problem → Flow → Pricing → Demo  
**Suggested length:** 8–10 slides · ~10–12 minutes + Q&A

---

## Slide 1 — Title
**SprintDeck Enterprise — Payments that feel native to India**  
Subtitle: UPI QR · Automatic plan unlock · No card gateway required  
Footer: Developed by OmegaTechnologies

*Say:* “We’ll cover why we chose UPI, how the QR and verification work, pricing, then a live demo.”

---

## Slide 2 — Problem
**Title:** Paying for team tools shouldn’t need a card gateway

Bullets:
- Indian teams already pay with UPI daily  
- Card/PSP flows add fees, KYC friction, and drop-off  
- Manual “send screenshot to admin” doesn’t scale  
- SprintDeck needs instant-enough unlock for Pro / Expert / Master  

*Say:* “The payment moment should feel as simple as scanning a QR at a shop.”

---

## Slide 3 — Solution snapshot
**Title:** Plan → QR → Pay → Auto-unlock

One visual line:

`Choose plan → UPI QR → Pay in PhonePe/GPay → Bank alert → Confirmed → Features unlock`

Bullets:
- Direct settlement to merchant UPI ID  
- No Stripe / Razorpay required for v1  
- Server-validated amounts  

---

## Slide 4 — How the QR is generated
**Title:** The QR is a standard UPI payment intent

Steps:
1. User selects plan (e.g. Pro)  
2. Server creates pending order (amount allow-listed)  
3. App builds `upi://pay?pa=…&am=201.00&cu=INR&tn=SprintDeck Pro`  
4. Browser renders that string as a QR  

Callout box:
> Any UPI app scanning it opens a **pre-filled** payment for the exact rupees.

---

## Slide 5 — How payment is verified
**Title:** Verification without a payment gateway webhook

Flow:
1. Customer pays  
2. Bank sends “amount credited” alert to merchant inbox  
3. Secure ingest API receives the alert text  
4. Backend checks: credit? amount? UTR duplicate? matching order?  
5. Order marked **confirmed**  
6. App polling sees success → plan activates  

Validation checklist (icons OK):
- Ingest secret  
- Credit-only  
- Exact amount  
- UTR de-dupe  
- Expired orders rejected  

---

## Slide 6 — Architecture (simple)
**Title:** Three moving parts

| Piece | Role |
|-------|------|
| SprintDeck web app | Shows plans, QR, polls status |
| Azure API + Cosmos | Orders, matching, subscription state |
| Gmail ingest script | Forwards bank credit alerts |

Optional footnote: “PSP-free reconciliation today; PG webhook optional later.”

---

## Slide 7 — Pricing
**Title:** Simple monthly tiers

| Plan | Price | Pay at checkout |
|------|-------|-----------------|
| Free | ₹0 | — |
| Pro | ₹199 | ₹201 |
| Expert | ₹499 | ₹501 |
| Master | ₹999 | ₹1001 |

Notes under table:
- ₹2 platform fee on paid plans  
- Mid-cycle upgrades = difference + ₹2  
- Active for 30 days  

---

## Slide 8 — What unlocks after payment
**Title:** Paid workspace features

- Tool integrations & larger ceremony controls  
- Retrospectives  
- Whiteboard  
- Team chat  
- Standup / timesheet workflows (post-login)  

*Say:* “Free covers plain poker; Enterprise unlocks the full ceremony suite.”

---

## Slide 9 — Live demo script
**Title:** Demo (3 minutes)

1. Open profile → Upgrade  
2. Choose Expert → show QR + amount  
3. Complete UPI pay **or** show already-active Master  
4. Wait for ✓ Payment received  
5. Open Whiteboard / Retro to prove unlock  

Backup if live pay is awkward:
- Use a pre-granted Master account  
- Still walk QR generation + status polling UI  

---

## Slide 10 — Why this for your team
**Title:** Fit for Indian agile orgs

- Familiar UPI UX  
- Automatic confirmation  
- Low payment overhead  
- Clear upgrade path  
- Room to add Razorpay/PhonePe PG later if you want card + instant webhooks  

---

## Slide 11 — Ask / next steps
**Title:** Proposed next step

1. Pilot Master for your scrum teams (2–4 weeks)  
2. Run real ceremonies + one real UPI purchase test  
3. Decide: stay UPI-QR, or add PG for cards/international  

Contact: OmegaTechnologies · omega-technologies.in  
Product: SprintDeck Enterprise

---

## Appendix — Objection handling (speaker notes)

| Objection | Answer |
|-----------|--------|
| “Is confirmation instant?” | Near-real-time via bank alert; typically seconds–~1 min. PG can make it webhook-instant later. |
| “Is this secure?” | Amounts server-validated; ingest secret-protected; UTR de-duped; no raw card data handled. |
| “What if alert is delayed?” | QR regenerates; pending order expires; user can retry. Support can admin-grant for pilots. |
| “Can we take cards?” | Not in this path; roadmap option via Razorpay/PhonePe PG. |
| “Where does money settle?” | Directly to your configured UPI VPA — not held by SprintDeck as a PSP. |

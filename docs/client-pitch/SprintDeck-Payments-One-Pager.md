# SprintDeck Payments — One-Pager (Client Pitch)

**Product:** SprintDeck Enterprise · **Model:** UPI QR · No Stripe / no card gateway  
**Audience:** Client demo · **Date:** 2026-08-12

---

## The problem

Agile teams need planning poker, retros, whiteboard, and chat in one place.  
Paid unlocks must be **simple for India** (UPI), **automatic** (no screenshot approvals), and **low-cost** (no heavy PSP fees on every payment).

---

## The solution

SprintDeck sells monthly plans via **standard UPI QR**:

1. Customer picks a plan  
2. App creates a server order and shows a QR  
3. Customer pays with PhonePe / GPay / any UPI app  
4. Bank credit alert is ingested and matched  
5. Plan unlocks automatically on screen  

**No payment gateway. Direct settlement to your UPI ID.**

---

## Pricing (demo numbers)

| Plan | Price / month | Pay amount (incl. ₹2 fee) |
|------|---------------|---------------------------|
| Free | ₹0 | — (plain poker sibling) |
| Pro | ₹199 | **₹201** |
| Expert | ₹499 | **₹501** |
| Master | ₹999 | **₹1001** |

- Upgrades are **prorated** (pay only the difference + ₹2)  
- Subscription active for **30 days**, then renew  
- Fee breakdown shown with ⓘ next to the amount  

---

## How the QR is generated

```
Choose plan → POST /api/order (amount allow-listed)
           → Server returns orderId + payAmount
           → App builds: upi://pay?pa=<UPI>&pn=SprintDeck&am=201.00&cu=INR&tn=...
           → QRCode library renders that URI as a scannable QR
```

Any UPI app opens a **pre-filled payment** for the exact amount.

---

## How payment is verified

```
UPI payment lands → Bank “credited” alert → Gmail script → POST /api/upi/ingest
                                                         → Parse credit + amount + UTR
                                                         → Match pending order
                                                         → Confirm order
Browser polls /api/upi/status every ~3s → ✓ Payment received → Plan unlocked
```

**Validation checks**

| Check | Why it matters |
|-------|----------------|
| Shared ingest secret | Blocks fake confirmations |
| Credit-only alerts | Debits ignored |
| Exact amount match | ₹201 credit ↔ ₹201 order |
| UTR de-dupe | Same bank ref can’t confirm twice |
| Amount allow-list | Client can’t invent prices |
| Order expiry | Unpaid QR / order times out |

---

## Why this model

- India-native UX (QR + UPI)  
- Automatic unlock — no “send payment screenshot”  
- Low overhead vs Stripe/Razorpay on every txn  
- Transparent amounts and upgrade math  

**Note:** Confirmation speed depends on bank alert delivery (usually seconds to ~1 minute). A future Razorpay/PhonePe PG path can add instant webhooks if required.

---

## 3-minute live demo

1. Profile → **Upgrade**  
2. Select **Expert** → show QR + ₹501  
3. Pay (or show a pre-activated Master account)  
4. Screen flips to **✓ Payment received**  
5. Open a paid feature (Whiteboard / Retro / Chat)  

---

## Ask / next step

Pilot on Master for your team → validate ceremonies + billing → decide production cutover / optional PG upgrade.

**Contact / product:** SprintDeck Enterprise · Developed by [OmegaTechnologies](https://omega-technologies.in)

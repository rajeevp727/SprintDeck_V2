# upi-verifier

A **PSP-free UPI payment verification** service. It confirms that money actually
landed in your bank account — without a payment gateway — by reading your bank's
**credit alert** (SMS or email), parsing the amount + UPI reference, and matching
it to a **pending order** that was given a **unique amount**.

Built to be called by **SprintDeck_V2** (and reusable by any app): create an
order, show the returned UPI QR, then poll status until it flips to `confirmed`.

> ⚠️ **Honest scope.** This is a low-volume, self-hosted alternative to a PSP
> (Razorpay/PhonePe/Cashfree). It has **no fees and no KYC**, but it is only as
> reliable as your bank alerts and the forwarder that relays them. For real
> business scale/compliance, use a PSP. See *Limitations*.

---

## How it works

```
                       POST /api/order {tier,email,baseAmount}
 SprintDeck_V2  ─────────────────────────────────────────────▶  upi-verifier
      │                    ◀── {orderId, payAmount: 499.02, upiLink}          │
      │  show QR for 499.02                                                   │
      │                                                                       ▼
   user pays ₹499.02 ──▶ your Axis account ──▶ bank sends a CREDIT alert (SMS/email)
                                                            │
        SMS forwarder / M365 email reader                   │
                     │  POST /api/upi/ingest {text}  (x-ingest-secret)        │
                     └────────────────────────────────────────────────────▶  │
                                     parse amount+UTR, match 499.02 → order   │
                                                            confirm the order ▼
 SprintDeck_V2  ── GET /api/upi/status?orderId=… ──▶  { status: "confirmed" } ┘
      └▶ activates the plan
```

**The key trick — unique amounts.** The UPI note field is unreliable, so we can't
tell *whose* payment arrived from the text. Instead each pending order for a plan
gets a distinct paise offset: ₹499.01, ₹499.02, ₹499.03… When a credit for
"₹499.02" arrives, we know **exactly** which order it was — no identity system
required. Offsets free up when an order confirms or expires (`ORDER_TTL_MINUTES`).

---

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | – | Liveness + whether a VPA is configured. |
| `POST` | `/api/order` | – | Create a pending order → `{ orderId, payAmount, vpa, upiLink }`. Body: `{ tier, email?, baseAmount }`. `baseAmount` must be one of the allowed plan prices. |
| `POST` | `/api/upi/ingest` | `x-ingest-secret` header | Feed a raw bank alert (`{ text, source? }`). Parses, stores a receipt, matches a pending order. |
| `GET` | `/api/upi/status?orderId=` | – | `{ status: "pending" \| "confirmed" \| "expired", tier, payAmount, confirmedAt }`. Client polls this. |

Dedupe: the same UTR ingested twice (e.g. SMS **and** email) confirms only once.
Debit/spend alerts are ignored — only **credits** can confirm an order.

---

## Configuration (app settings / `local.settings.json`)

Copy `local.settings.json.example` → `local.settings.json` and fill in:

| Setting | Required | Notes |
|---|---|---|
| `UPI_VPA` | ✅ | Your payee VPA, e.g. `7032075893-groww@axisbank`. |
| `PAYEE_NAME` | | Name shown in the UPI app (default `SprintDeck`). |
| `INGEST_SECRET` | ✅ | Long random string. The forwarder must send it as `x-ingest-secret`. Protects against forged "payment received" posts. |
| `COSMOS_CONNECTION_STRING` | | If set, orders/receipts persist in Cosmos (durable, multi-instance). If empty, an **in-memory** map is used (single instance / local only). |
| `ORDER_TTL_MINUTES` | | How long a pending order reserves its unique amount (default `30`). |

`ALLOWED_AMOUNTS` (the valid plan prices) is set in `src/functions/verifier.js`
(`199, 499, 999`) — keep it in sync with the app's tiers.

---

## Relaying bank alerts to `/api/upi/ingest`

Pick **one** source:

### Option A — Android SMS forwarder (works with just a phone)
1. Install an SMS-forwarding app (e.g. *SMS to URL Forwarder*).
2. Rule: **from** your bank sender ID (e.g. `AxisBk`), **forward to**
   `https://<your-func>/api/upi/ingest` as JSON `{"text": "%message%", "source": "sms"}`
   with header `x-ingest-secret: <INGEST_SECRET>`.

### Option B — Email (Microsoft 365 / any mailbox)
1. Turn on your bank's **email** transaction alerts.
2. A small reader (Power Automate flow, or an Azure Function using Microsoft
   Graph) posts new alert emails' body to `/api/upi/ingest` with the secret
   header and `source: "email"`.

Either way the endpoint is identical; `source` is just for auditing.

---

## Local development

```bash
npm install
cp local.settings.json.example local.settings.json   # then edit values
npm start        # func start — http://localhost:7071

npm test         # unit tests (parser + unique-amount logic), no deps needed
```

Smoke test:
```bash
curl -X POST localhost:7071/api/order -d '{"tier":"expert","baseAmount":499}'
# → {"orderId":"…","payAmount":499.01,"vpa":"…","upiLink":"upi://pay?…am=499.01…"}

curl -X POST localhost:7071/api/upi/ingest \
  -H 'x-ingest-secret: <secret>' \
  -d '{"text":"INR 499.01 credited UPI Ref no 412345678901"}'
# → {"matched":true,"orderId":"…","tier":"expert"}

curl "localhost:7071/api/upi/status?orderId=<id>"
# → {"status":"confirmed",…}
```

---

## Deploy

Deploy as an Azure Functions app (same account/tooling as SprintDeck):
`func azure functionapp publish <app-name>`, then set the app settings above in
the Function App configuration. Add a Cosmos connection string for durability.
Point SprintDeck_V2's client at the deployed base URL.

---

## Limitations (read before relying on this)

- **Reliability = your alert pipeline.** If the phone/mailbox is offline or the
  forwarder drops a message, that payment won't auto-confirm (manual fallback:
  ingest the alert text later).
- **Format drift.** Banks change SMS/email wording; update the regexes in
  `src/parse.js` and add a test case when they do.
- **No refunds/disputes/settlement reporting** — that's PSP territory.
- **Tax/compliance.** Money received is taxable income; routing business revenue
  through a personal account long-term isn't ideal. A PSP + current account gives
  clean invoices/GST.
- **Security.** Always set a strong `INGEST_SECRET`; without it anyone could POST
  a fake credit and confirm orders for free.

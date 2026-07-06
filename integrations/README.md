# Integrations

## gmail-ingest.gs — Gmail → auto-confirm payments

A Google Apps Script that reads UPI **credit-alert emails** in a Gmail account and
POSTs them to SprintDeck's `POST /api/upi/ingest`, so orders confirm automatically
24/7 (no SMS, no phone — email alerts avoid the SMS/telecom time gaps).

### Setup (once)
1. https://script.google.com → **New project** (signed in as the account that
   receives the bank alerts, e.g. `mrrajeevp727@gmail.com`).
2. Paste `gmail-ingest.gs`.
3. Ensure `INGEST_SECRET` matches the Azure Static Web App **Application setting**
   `INGEST_SECRET`.
4. Run **`createTrigger`** once and approve the permission prompts. Optionally run
   **`testOnce`** to forward the latest matching emails immediately.
5. Tighten `GMAIL_QUERY` with the real sender (e.g. `from:alerts@axisbank.com`)
   for precision.

### Requirements on the backend
- `INGEST_SECRET` set (Azure app setting) — auth for the endpoint.
- `COSMOS_CONNECTION_STRING` set — **required in prod** so the order created on one
  Function instance is visible to the ingest on another (in-memory won't match
  across instances / cold starts).

### Notes
- Debit alerts are ignored by the backend; only credits confirm an order.
- Poll runs every minute; confirmation lands within ~1 min of the email arriving.
- The client QR window is 120s — if email is slower than that, the modal shows
  "expired" but the order still confirms server-side (bump `PAY_WINDOW` in
  `SubscriptionModal.tsx` if you want a longer visible window).

/**
 * SprintDeck — Gmail → UPI ingest bridge (Google Apps Script)
 * ------------------------------------------------------------
 * Reads bank / UPI credit-alert emails that arrive in this Gmail account and
 * forwards them to SprintDeck's /api/upi/ingest endpoint, so payments confirm
 * automatically 24/7 — no SMS, no phone. Email alerts aren't subject to the
 * SMS/telecom time gaps, so this is the reliable path.
 *
 * Setup (once):
 *   1. Open https://script.google.com  → New project.
 *   2. Paste this whole file in.  (Signed in as the merchant Gmail)
 *   3. Confirm INGEST_SECRET below matches the Azure app setting.
 *   4. Set INGEST_URL to your production SWA domain.
 *   5. Run `createTrigger` once → approve the permission prompts
 *      (read Gmail + connect to external service).
 *   6. Done. It polls every minute; inside each minute it re-checks Gmail
 *      every ~3s so email→ingest latency is a few seconds, not a full minute.
 *
 * The backend ignores debit alerts, so it's harmless that both the "sent"
 * (debit) and "received" (credit) mails land here — only credits confirm.
 */

// ── Config ───────────────────────────────────────────────────────────────────
const INGEST_URL = 'https://green-desert-0f2350910.7.azurestaticapps.net/api/upi/ingest';
const INGEST_SECRET = 'PASTE_YOUR_INGEST_SECRET_HERE'; // must equal the Azure INGEST_SECRET app setting

// Prefer recent unread credits. Tighten `from:` once you know your bank sender.
const GMAIL_QUERY = 'newer_than:1d (credited OR "received" OR "deposited")';

// ── Poller (runs on the timer) ────────────────────────────────────────────────
// Google time-triggers fire at most once/minute. Inside that minute we re-check
// Gmail every ~3s so confirmation lands in a few seconds after the email arrives.
// Dedups per MESSAGE via Script Properties. Backend also dedups by UTR.
function pollBankAlerts() {
  const ROUNDS = 18; // 18 × 3s ≈ 54s (fits inside the 1-minute trigger window)
  const GAP_MS = 3000;
  for (let r = 0; r < ROUNDS; r++) {
    forwardNewAlerts_();
    if (r < ROUNDS - 1) Utilities.sleep(GAP_MS);
  }
}

function forwardNewAlerts_() {
  const props = PropertiesService.getScriptProperties();
  const seen = new Set(JSON.parse(props.getProperty('seenMsgIds') || '[]'));
  // Newest first so a just-arrived credit is ingested immediately.
  const threads = GmailApp.search(GMAIL_QUERY, 0, 20);
  let changed = false;
  for (const thread of threads) {
    const messages = thread.getMessages().reverse();
    for (const msg of messages) {
      const id = msg.getId();
      if (seen.has(id)) continue;
      try {
        const res = UrlFetchApp.fetch(INGEST_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-secret': INGEST_SECRET },
          payload: JSON.stringify({ text: msg.getPlainBody(), source: 'email' }),
          muteHttpExceptions: true,
        });
        console.log(msg.getSubject() + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
      } catch (e) {
        console.error('ingest failed: ' + e);
      }
      seen.add(id);
      changed = true;
    }
  }
  if (changed) props.setProperty('seenMsgIds', JSON.stringify([...seen].slice(-800)));
}

// ── Run ONCE to schedule the poller every minute ──────────────────────────────
function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pollBankAlerts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollBankAlerts').timeBased().everyMinutes(1).create();
  console.log('Trigger created: pollBankAlerts every 1 minute (inner loop ~3s).');
}

// Optional: run manually to test parsing/forwarding right now.
function testOnce() {
  const threads = GmailApp.search(GMAIL_QUERY, 0, 5);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const res = UrlFetchApp.fetch(INGEST_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-secret': INGEST_SECRET },
        payload: JSON.stringify({ text: msg.getPlainBody(), source: 'email-test' }),
        muteHttpExceptions: true,
      });
      console.log(msg.getSubject() + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
    }
  }
}

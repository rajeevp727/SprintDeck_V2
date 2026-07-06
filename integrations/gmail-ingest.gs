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
 *   2. Paste this whole file in.  (Signed in as mrrajeevp727@gmail.com)
 *   3. Confirm INGEST_SECRET below matches the Azure app setting.
 *   4. Run `createTrigger` once → approve the permission prompts
 *      (read Gmail + connect to external service).
 *   5. Done. It now polls every minute and confirms paid orders on its own.
 *
 * The backend ignores debit alerts, so it's harmless that both the "sent"
 * (debit) and "received" (credit) mails land here — only credits confirm.
 */

// ── Config ───────────────────────────────────────────────────────────────────
const INGEST_URL = 'https://sprintdeckv2.rajeevstech.in/api/upi/ingest';
const INGEST_SECRET = 'PASTE_YOUR_INGEST_SECRET_HERE'; // must equal the Azure INGEST_SECRET app setting

// Gmail search for candidate alert emails. Broad by default; TIGHTEN it once
// you know the exact sender, e.g. append:
//   from:(alerts@axisbank.com OR noreply@phonepe.com OR *@canarabank.com)
const GMAIL_QUERY = 'newer_than:2d (credited OR "received" OR "deposited")';

// ── Poller (runs on the timer) ────────────────────────────────────────────────
// Dedups per MESSAGE (not per thread) via Script Properties, so a second alert
// in an existing thread is still forwarded. The backend also dedups by UTR, so
// a rare double-send never double-confirms.
// Time-triggers fire at most once/minute, so this run re-checks Gmail every
// ~10s for the whole minute → email→ingest latency drops from up to 60s to ~10s.
function pollBankAlerts() {
  const ROUNDS = 5; // 5 checks × ~10s ≈ covers the minute
  const GAP_MS = 10000;
  for (let r = 0; r < ROUNDS; r++) {
    forwardNewAlerts_();
    if (r < ROUNDS - 1) Utilities.sleep(GAP_MS);
  }
}

function forwardNewAlerts_() {
  const props = PropertiesService.getScriptProperties();
  const seen = new Set(JSON.parse(props.getProperty('seenMsgIds') || '[]'));
  const threads = GmailApp.search(GMAIL_QUERY, 0, 25);
  let changed = false;
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
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
  console.log('Trigger created: pollBankAlerts every 1 minute.');
}

// Optional: run manually to test parsing/forwarding right now (ignores the label).
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

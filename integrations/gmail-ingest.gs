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

const PROCESSED_LABEL = 'sd-ingested'; // threads get this label so they aren't resent

// ── Poller (runs on the timer) ────────────────────────────────────────────────
function pollBankAlerts() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  const threads = GmailApp.search(GMAIL_QUERY + ' -label:' + PROCESSED_LABEL, 0, 25);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const text = msg.getPlainBody();
      try {
        const res = UrlFetchApp.fetch(INGEST_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-secret': INGEST_SECRET },
          payload: JSON.stringify({ text: text, source: 'email' }),
          muteHttpExceptions: true,
        });
        console.log(msg.getSubject() + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
      } catch (e) {
        console.error('ingest failed: ' + e);
      }
    }
    thread.addLabel(label); // mark processed
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
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

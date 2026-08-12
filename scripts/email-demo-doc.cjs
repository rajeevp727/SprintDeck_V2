#!/usr/bin/env node
'use strict';

/**
 * Email the SprintDeck feature demo guide as a high-importance message.
 *
 * Usage:
 *   RESEND_API_KEY=... EMAIL_FROM='SprintDeck <noreply@sprintdeck.in>' \
 *     node scripts/email-demo-doc.cjs [to@email]
 *
 * Default recipient: mrrajeev18@gmail.com
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs/demo/SprintDeck-Feature-Demo.md');
const DEFAULT_TO = 'mrrajeev18@gmail.com';

function mdToSimpleHtml(md) {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBreaks = escaped
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\|(.+)\|$/gm, '<pre>$&</pre>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#111">
  <p><strong>IMPORTANT — SprintDeck client demo documentation</strong></p>
  <p>Attached: <code>SprintDeck-Feature-Demo.md</code></p>
  <p>Also on GitHub: <a href="https://github.com/rajeevp727/SprintDeck_V2/blob/main/docs/demo/SprintDeck-Feature-Demo.md">docs/demo/SprintDeck-Feature-Demo.md</a></p>
  <hr/>
  <div>${withBreaks}</div>
  </body></html>`;
}

async function main() {
  const to = process.argv[2] || process.env.DEMO_DOC_EMAIL_TO || DEFAULT_TO;
  if (!fs.existsSync(DOC)) {
    console.error('Missing demo doc:', DOC);
    process.exit(1);
  }

  // Ensure api email helper can resolve relative requires when loaded from scripts/
  const email = require(path.join(ROOT, 'api/src/email'));
  if (!email.isEmailConfigured()) {
    console.error('Email not configured. Set RESEND_API_KEY or SENDGRID_API_KEY (and EMAIL_FROM).');
    process.exit(1);
  }

  const md = fs.readFileSync(DOC, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const subject = `[IMPORTANT] SprintDeck Feature Demo Guide — ${today}`;
  const text = `IMPORTANT — SprintDeck Feature Demo Guide (${today})

Open the attached SprintDeck-Feature-Demo.md

GitHub:
https://github.com/rajeevp727/SprintDeck_V2/blob/main/docs/demo/SprintDeck-Feature-Demo.md

---
${md}
`;
  const html = mdToSimpleHtml(md);
  const attachments = [
    {
      filename: 'SprintDeck-Feature-Demo.md',
      content: Buffer.from(md, 'utf8').toString('base64'),
      type: 'text/markdown',
    },
  ];
  const headers = {
    Importance: 'high',
    'X-Priority': '1',
    Priority: 'urgent',
    'X-MSMail-Priority': 'High',
  };

  await email.sendEmail({ to, subject, html, text, headers, attachments });
  console.log(`Sent IMPORTANT demo doc email to ${to}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

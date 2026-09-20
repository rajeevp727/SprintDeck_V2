'use strict';

function fromAddress() {
  return process.env.EMAIL_FROM || 'SprintDeck <onboarding@resend.dev>';
}

function fromParts() {
  const raw = fromAddress();
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || 'SprintDeck', email: m[2].trim() };
  return { name: 'SprintDeck', email: raw.trim() };
}

async function sendViaResend({ to, subject, html, text, headers, attachments }) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return false;
  const payload = {
    from: fromAddress(),
    to: [to],
    subject,
    html,
    text,
  };
  if (headers && Object.keys(headers).length) payload.headers = headers;
  if (attachments && attachments.length) payload.attachments = attachments;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error (${res.status}): ${body.slice(0, 200)}`);
  }
  return true;
}

async function sendViaSendGrid({ to, subject, html, text, headers, attachments }) {
  const key = process.env.SENDGRID_API_KEY || '';
  if (!key) return false;
  const from = fromParts();
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from.email, name: from.name },
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html },
    ],
  };
  if (headers && Object.keys(headers).length) payload.headers = headers;
  if (attachments && attachments.length) {
    payload.attachments = attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.type || 'application/octet-stream',
      disposition: 'attachment',
    }));
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid error (${res.status}): ${body.slice(0, 200)}`);
  }
  return true;
}

function hasEnv(name) {
  return !!(process.env[name] && String(process.env[name]).trim());
}

async function sendEmail({ to, subject, html, text, headers, attachments }) {
  if (hasEnv('RESEND_API_KEY')) {
    return sendViaResend({ to, subject, html, text, headers, attachments });
  }
  if (hasEnv('SENDGRID_API_KEY')) {
    return sendViaSendGrid({ to, subject, html, text, headers, attachments });
  }
  return false;
}

function isEmailConfigured() {
  return hasEnv('RESEND_API_KEY') || hasEnv('SENDGRID_API_KEY');
}


const appUrl = () => (process.env.APP_URL || 'https://sprintdeck.in').replace(/\/$/, '');

/**
 * Wraps a message in the branded shell. Table layout and inline styles because
 * Outlook ignores most modern CSS, and a PNG logo because Gmail and Outlook do
 * not render SVG in mail.
 */
function layout({ title, bodyHtml }) {
  const base = appUrl();
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0b1020;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1020;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111a33;border:1px solid #1f2b4d;border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;" valign="middle">
                      <img src="${base}/apple-touch-icon.png" width="48" height="48" alt="SprintDeck"
                           style="display:block;border:0;border-radius:10px;" />
                    </td>
                    <td valign="middle"
                        style="font:700 22px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eaf0ff;">
                      SprintDeck
                    </td>
                  </tr>
                </table>
                <h1 style="margin:22px 0 0 0;font:600 20px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eaf0ff;">
                  ${title}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#c3cde6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;border-top:1px solid #1f2b4d;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;">
                      <img src="${base}/apple-touch-icon.png" width="24" height="24" alt="SprintDeck"
                           style="display:block;border:0;border-radius:6px;" />
                    </td>
                    <td style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8595b8;">
                      <strong style="color:#c3cde6;">SprintDeck</strong> — run your scrum ceremonies in one real-time room.
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6f7fa3;">
                  <a href="${base}" style="color:#8aa6ff;text-decoration:none;">sprintdeck.in</a>
                  &nbsp;·&nbsp;
                  <a href="${base}/privacy" style="color:#8aa6ff;text-decoration:none;">Privacy</a>
                  &nbsp;·&nbsp;
                  <a href="${base}/terms" style="color:#8aa6ff;text-decoration:none;">Terms</a>
                  &nbsp;·&nbsp;
                  <a href="${base}/security" style="color:#8aa6ff;text-decoration:none;">Security</a>
                </p>
                <p style="margin:10px 0 0 0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6f7fa3;">
                  This message was sent to you because someone asked to set a password for this address on SprintDeck.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendPasswordResetEmail(to, resetUrl, { reason } = {}) {
  const fromSettings = reason === 'settings';
  const subject = fromSettings ? 'Change your SprintDeck password' : 'Reset your SprintDeck password';
  const intro = fromSettings
    ? 'You requested a password change from Account settings. Use this one-time link to set a new password (valid for 30 minutes):'
    : 'Reset your SprintDeck password using this link (valid for 30 minutes):';
  const text = `${intro}\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email — your password will stay the same.\n\nSprintDeck · ${appUrl()}`;
  const bodyHtml = `
    <p style="margin:0 0 20px 0;">${intro}</p>
    <p style="margin:0 0 20px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;padding:12px 22px;border-radius:8px;background:#5b7cfa;color:#ffffff;font-weight:600;text-decoration:none;">
        Set a new password
      </a>
    </p>
    <p style="margin:0 0 20px 0;font-size:13px;color:#8595b8;word-break:break-all;">
      Or paste this link into your browser:<br />${resetUrl}
    </p>
    <p style="margin:0;font-size:13px;color:#8595b8;">
      If you did not request this, ignore this email — your password will stay the same.
    </p>`;
  return sendEmail({ to, subject, html: layout({ title: subject, bodyHtml }), text });
}

module.exports = { sendEmail, sendPasswordResetEmail, isEmailConfigured };


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

async function sendPasswordResetEmail(to, resetUrl, { reason } = {}) {
  const fromSettings = reason === 'settings';
  const subject = fromSettings ? 'Change your SprintDeck password' : 'Reset your SprintDeck password';
  const intro = fromSettings
    ? 'You requested a password change from Account settings. Use this one-time link to set a new password (valid for 30 minutes):'
    : 'Reset your SprintDeck password using this link (valid for 30 minutes):';
  const text = `${intro}\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email — your password will stay the same.`;
  const html = `
    <p>${intro}</p>
    <p><a href="${resetUrl}">Set a new password</a></p>
    <p style="color:#666;font-size:13px;word-break:break-all;">${resetUrl}</p>
    <p>If you did not request this, you can ignore this email — your password will stay the same.</p>
  `;
  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendPasswordResetEmail, isEmailConfigured };

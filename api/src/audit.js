'use strict';

function redactEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 2) return '[redacted]';
  return `${s.slice(0, 2)}***${s.slice(at)}`;
}

function audit(context, event, meta = {}) {
  const safe = { ...meta };
  if (safe.email) safe.email = redactEmail(safe.email);
  const line = JSON.stringify({ event, at: new Date().toISOString(), ...safe });
  if (context && typeof context.log === 'function') context.log(`[audit] ${line}`);
}

module.exports = { audit, redactEmail };

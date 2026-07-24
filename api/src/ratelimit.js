'use strict';

// Best-effort in-memory per-IP rate limit (per Function instance). Shared by the
// chat / retro / negotiate write endpoints. Applied to low-frequency writes only
// — never to the 1.5s poll or voting, which would false-positive for a whole
// team behind one NAT IP. Limits are deliberately generous.
const hits = new Map();

function rateLimited(req, bucket, max, windowMs) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

module.exports = { rateLimited };

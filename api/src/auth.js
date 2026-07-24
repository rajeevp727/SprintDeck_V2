'use strict';

// Reads the authenticated user injected by Azure Static Web Apps built-in auth
// (EasyAuth). SWA validates the identity provider's token and forwards the
// principal to the Functions API in the `x-ms-client-principal` header (base64
// JSON). This is the trustworthy server-side identity — unlike participantId,
// the client cannot forge it (SWA strips any client-supplied value).
//
// Returns { userId, name, provider, roles } or null when unauthenticated.
// INERT until SWA auth is configured (staticwebapp.config.json + app settings);
// nothing calls this yet, so it changes no behavior.
function getUser(req) {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    if (!principal || !principal.userId) return null;
    return {
      userId: principal.userId,
      name: principal.userDetails || '',
      provider: principal.identityProvider || '',
      roles: Array.isArray(principal.userRoles) ? principal.userRoles : [],
    };
  } catch {
    return null;
  }
}

module.exports = { getUser };

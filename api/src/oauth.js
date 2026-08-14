'use strict';

const jose = require('jose');

function configured() {
  return {
    google: !!(process.env.GOOGLE_CLIENT_ID && String(process.env.GOOGLE_CLIENT_ID).trim()),
    microsoft: !!(process.env.AZURE_CLIENT_ID && String(process.env.AZURE_CLIENT_ID).trim()),
  };
}

async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured');

  const jwks = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jose.jwtVerify(idToken, jwks, {
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });

  if (!payload.email || payload.email_verified === false) {
    throw new Error('Google account email is not verified');
  }

  return {
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || payload.given_name || '').trim(),
    providerSub: String(payload.sub || ''),
  };
}

async function verifyMicrosoftIdToken(idToken) {
  const clientId = process.env.AZURE_CLIENT_ID;
  if (!clientId) throw new Error('Microsoft sign-in is not configured');

  const tenant = process.env.AZURE_TENANT_ID || 'common';
  const jwks = jose.createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`),
  );
  const { payload } = await jose.jwtVerify(idToken, jwks, { audience: clientId });

  const iss = String(payload.iss || '');
  if (!iss.startsWith('https://login.microsoftonline.com/')) {
    throw new Error('Invalid Microsoft token issuer');
  }

  const email = String(payload.preferred_username || payload.email || '').toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Microsoft account has no email');

  return {
    email,
    name: String(payload.name || '').trim(),
    providerSub: String(payload.oid || payload.sub || ''),
  };
}

async function verifyProviderToken(provider, idToken) {
  if (provider === 'google') return verifyGoogleIdToken(idToken);
  if (provider === 'microsoft') return verifyMicrosoftIdToken(idToken);
  throw new Error('Unsupported sign-in provider');
}

module.exports = { configured, verifyProviderToken };

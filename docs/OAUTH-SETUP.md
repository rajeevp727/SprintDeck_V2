# OAuth sign-in — a setup guide

How Google and Microsoft sign-in are wired in SprintDeck, written so it can be followed for a
different project. It is deliberately specific: every step names the screen, the field and the
value, and every failure listed here is one this project actually hit in production.

The shape it describes is a **browser-side implicit `id_token` flow with server-side
verification**. No client secret exists anywhere, which is what makes it safe to run from a static
site with a serverless API.

- [1. Decide the flow first](#1-decide-the-flow-first)
- [2. Google — provider setup](#2-google--provider-setup)
- [3. Microsoft — provider setup](#3-microsoft--provider-setup)
- [4. Wiring the app](#4-wiring-the-app)
- [5. Configuration — the part that breaks](#5-configuration--the-part-that-breaks)
- [6. The account model](#6-the-account-model)
- [7. Verification checklist](#7-verification-checklist)
- [8. Failures and what they mean](#8-failures-and-what-they-mean)

---

## 1. Decide the flow first

| | Implicit `id_token` (this guide) | Authorization code + PKCE |
|---|---|---|
| Client secret | none | none (PKCE) or one (confidential) |
| Who verifies | your API, against provider JWKS | your API, via a token exchange |
| Refresh tokens | no | yes |
| Good for | sign-in only ("who is this person?") | calling provider APIs later |

Pick implicit `id_token` when all you want is identity. The moment you need to *call* Google or
Microsoft APIs on the user's behalf, move to authorization code + PKCE — you will need refresh
tokens, and this guide stops being the right shape.

**The rule that makes either flow safe: the browser never decides who you are.** It carries a
token; the server verifies the signature, the audience and the issuer, and only then mints its own
session. An `id_token` posted by a client is *a claim*, not proof, until your API has checked it.

---

## 2. Google — provider setup

**Console:** https://console.cloud.google.com → APIs & Services.

### 2.1 Project and consent screen

1. Create (or pick) a project.
2. **OAuth consent screen** → **External** unless everyone signing in is in your Workspace.
3. Fill in: app name, user support email, developer contact email.
4. **Branding** → app logo is optional. Uploading one sends the app for **brand verification**,
   which can take days and blocks changes while it is pending. Skip the logo until you actually
   need it — this project had to remove the logo before the page would save at all.
5. **Audience** → while in *Testing*, only listed test users can sign in. Publish to *Production*
   when you want anyone to; for `openid profile email` scopes only, Google does not require a
   security review.
6. **Scopes** → add `openid`, `profile`, `email`. Nothing else. Every extra scope is another
   consent prompt and another reason for review.

### 2.2 Credentials

**Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.

| Field | Value |
|---|---|
| Authorized JavaScript origins | `https://yourdomain.com`, plus `http://localhost:5173` for dev |
| Authorized redirect URIs | `https://yourdomain.com/auth/google/callback`, plus the localhost equivalent |

Both lists matter, and they are matched **exactly** — scheme, host, port, path, no trailing slash.
`https://www.yourdomain.com` is a different origin from `https://yourdomain.com`; add both if both
resolve.

Copy the **Client ID**. There is a client secret; this flow never uses it. Do not put it in the
frontend, and do not put it in the API either unless you move to the code flow.

### 2.3 Housekeeping

Delete OAuth clients you stopped using, and redirect URIs for environments that no longer exist
(old Codespaces URLs, dead preview domains). Each one is a live entry point.

---

## 3. Microsoft — provider setup

**Portal:** https://portal.azure.com → Microsoft Entra ID → App registrations.

### 3.1 Register

1. **New registration**. Name it after the app.
2. **Supported account types** — for a public product, *Accounts in any organizational directory
   and personal Microsoft accounts*. This decides your tenant value in step 4; a single-tenant app
   uses its tenant GUID, a multi-tenant one uses `common`.
3. **Redirect URI** → platform **Single-page application (SPA)**, URI
   `https://yourdomain.com/auth/microsoft/callback`.

   Choosing **Web** instead of **SPA** here is the single most common mistake: Web clients expect
   a client secret and will reject the browser's request.

### 3.2 Turn on the implicit grant — the checkbox everyone misses

**Authentication** → scroll to **Implicit grant and hybrid flows** → tick **ID tokens (used for
implicit and hybrid flows)** → **Save**.

```
  Authentication
  ├─ Platform configurations
  │   └─ Single-page application
  │       └─ Redirect URIs:  https://yourdomain.com/auth/microsoft/callback
  │
  ├─ Implicit grant and hybrid flows
  │   ├─ [ ] Access tokens  (leave unticked — you are not calling Graph)
  │   └─ [x] ID tokens      ← THIS ONE
  │
  └─ [ Save ]
```

Without it, sign-in fails with *"The provided value for the input parameter 'response_type' is not
allowed for this client"*. The app registration looks complete; the flow is simply disabled.

### 3.3 API permissions

`User.Read` (delegated) is added by default and is enough. The `email`, `profile` and `openid`
scopes are implicit in an OIDC request.

### 3.4 The "unverified" screen

Until you complete **publisher verification** (an MPN / Partner Center account tied to the
tenant), users see an *"unverified"* warning on the consent screen. It is cosmetic — sign-in works
— but it looks bad to a first-time enterprise user. Publisher verification needs a Partner Center
account and domain ownership; it is worth doing before a serious launch, not before a pilot.

---

## 4. Wiring the app

Four pieces. In this repo they are [`src/lib/auth.ts`](../src/lib/auth.ts),
[`src/App.tsx`](../src/App.tsx), [`api/src/oauth.js`](../api/src/oauth.js) and
[`api/src/functions/auth.js`](../api/src/functions/auth.js).

### 4.1 Build the authorize URL

```ts
const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: `${origin}/auth/google/callback`,
  response_type: 'id_token',
  scope: 'openid profile email',
  prompt: 'select_account',
  nonce: randomToken(),   // mandatory for response_type=id_token at both providers
  state: randomToken(),   // returned untouched; reject anything that does not match
});
```

- Google: `https://accounts.google.com/o/oauth2/v2/auth?…`
- Microsoft: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?…`

`prompt=select_account` shows the account chooser. `prompt=login` forces a password re-entry; it
does **not** hide the "we found your account" card, so do not reach for it expecting that.

### 4.2 The callback page and the handoff

The popup lands on `/auth/{provider}/callback`. The token arrives in the URL **fragment**
(`#id_token=…&state=…`) — fragments are never sent to the server, which is the point.

The callback route reads the fragment and hands `{ state, idToken, error }` back to the opener.
**Send it two ways**:

```ts
window.opener?.postMessage(payload, window.location.origin);  // fast path
writeHandoff(payload);  // localStorage — survives a null opener
```

The opener listens for `message`, for the `storage` event, *and* polls localStorage, then matches
on `state` and rejects anything else. Give the handoff a TTL (5 minutes here) and clear it on
success — a token sitting in localStorage is a liability.

Why the belt and braces: see COOP below.

### 4.3 Cross-Origin-Opener-Policy will break your popup

A global `Cross-Origin-Opener-Policy: same-origin` severs `window.opener` when the popup returns
from the provider — it lands in a different browsing-context group, `postMessage` silently does
nothing, and the user sees "sign-in cancelled" forever.

What works:

```jsonc
"globalHeaders": {
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups"
},
"routes": [
  { "route": "/auth/google/callback",    "headers": { "Cross-Origin-Opener-Policy": "unsafe-none" } },
  { "route": "/auth/microsoft/callback", "headers": { "Cross-Origin-Opener-Policy": "unsafe-none" } }
]
```

`same-origin-allow-popups` on the app, `unsafe-none` on the two callback routes only. Keep the
localStorage fallback anyway — browsers differ, and this is not a failure you want to debug from a
user's bug report.

Also allow the provider hosts in your CSP `connect-src` / `frame-src`:
`https://login.microsoftonline.com`, `https://oauth2.googleapis.com`.

### 4.4 Verify on the server — the part that actually matters

```js
const jwks = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const { payload } = await jose.jwtVerify(idToken, jwks, {
  audience: clientId,                                          // must be YOUR client id
  issuer: ['https://accounts.google.com', 'accounts.google.com'],
});
if (!payload.email || payload.email_verified === false) throw new Error('unverified email');
```

Microsoft, with the multi-tenant wrinkle:

```js
const jwks = jose.createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`),
);
const { payload } = await jose.jwtVerify(idToken, jwks, { audience: clientId });
// With tenant = 'common' the issuer is per-tenant, so it cannot be pinned to a literal —
// check the prefix instead.
if (!String(payload.iss).startsWith('https://login.microsoftonline.com/')) throw new Error('bad issuer');
```

Non-negotiables:

1. **Verify the signature against the provider's JWKS**, fetched over HTTPS, with caching.
   `jose.createRemoteJWKSet` does the caching and key rotation for you.
2. **Check `audience` equals your client id.** Without it, a token minted for *any* other app
   passes, and anyone with their own Google client can sign in as anyone.
3. **Check the issuer.** Pin it literally when you can; prefix-match when the tenant is variable.
4. **Take the email from the verified payload**, never from the request body.
   Google: `email` + `email_verified`. Microsoft: `preferred_username`, falling back to `email`.
5. **Mint your own session token** after verification. The provider token's job ends there.

### 4.5 Issue your own session

```js
const token = jwt.sign({ sub: user.id, email: user.email, sid }, process.env.JWT_SECRET, ttl);
```

From here the provider is irrelevant — your API validates your token. Everything else (device
limits, plans, revocation) hangs off your session, not theirs.

---

## 5. Configuration — the part that breaks

### 5.1 Two homes for the same value

| Value | Where it must live | Read at |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID`, `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` | CI secrets/vars, injected on the **build step** | **build** time — inlined into the bundle |
| `GOOGLE_CLIENT_ID`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `JWT_SECRET` | hosting app settings (Azure SWA → Configuration) | **request** time |

**This is the one that cost this project the most time.** Vite inlines `VITE_*` at build; putting
those variables on the *deploy* step of the workflow instead of the *build* step means they are
never in the bundle. The build succeeds, the site loads, and the sign-in buttons do nothing.

```yaml
- name: Build frontend bundle
  env:                                           # ← on the BUILD step, not the deploy step
    VITE_GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
    VITE_AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    VITE_AZURE_TENANT_ID: ${{ vars.AZURE_TENANT_ID }}
  run: npm ci && npm run build
```

### 5.2 The two copies must match

The client id in the bundle and the one in the API's app settings must be **the same string**. If
they drift, the token is minted for audience A and verified against audience B, and you get
`ERR_JWT_CLAIM_VALIDATION_FAILED: unexpected "aud" claim value` — a confusing error, because both
values are individually correct.

Ship a tiny diagnostic endpoint (`GET /api/auth/oauth-status`) that reports which providers the
*server* thinks are configured. It turns a 20-minute guess into a 5-second check.

### 5.3 Library pinning

`jose` v6 is **ESM-only**. In a CommonJS serverless function (`require`), it throws
`ERR_REQUIRE_ESM` at cold start and the endpoint returns an empty 500. Pin `jose@^4` unless the
runtime is ESM.

---

## 6. The account model

Decide this **before** launch; changing it later means migrating live accounts.

The same person can arrive as `alice@corp.com` through Google *and* through Microsoft. Two
options:

- **Separate accounts per provider** (what this project chose). The account id carries the
  provider — `google:alice@corp.com`, `microsoft:alice@corp.com`, bare email for password
  accounts. Simple, no surprises, and no way to hijack an account by registering the same address
  at another provider. Cost: the person has two accounts, and anything account-scoped (plan,
  history) does not follow them across.
- **Link by verified email.** One account, several sign-in methods. Friendlier, but you *must*
  only link on a provider-verified email, or an attacker who controls an unverified address at any
  provider inherits the account.

Never link on an unverified email. Google's `email_verified: false` is a real value that shows up
in the wild.

---

## 7. Verification checklist

Before calling it done, confirm each of these by doing it:

- [ ] Sign in with Google on production; the account chooser appears and you land signed in.
- [ ] Sign in with Microsoft on production, both a work account and a personal one.
- [ ] `/api/auth/oauth-status` reports both providers configured.
- [ ] A tampered `id_token` (change one character) is rejected with a 4xx, not a 500.
- [ ] A token minted for a *different* client id is rejected — this is the audience check.
- [ ] Sign-in works in a private window (no pre-existing session, no cached storage).
- [ ] Popup blocked → the app shows a clear message rather than hanging.
- [ ] Cancelling at the provider returns you to the app, not a dead popup.
- [ ] Local dev works on `localhost` with its own redirect URIs registered.
- [ ] No client secret appears in the repo, the bundle, or CI logs.

---

## 8. Failures and what they mean

| Symptom | Cause | Fix |
|---|---|---|
| "Sign-in cancelled" every time, popup closes silently | COOP severed `window.opener` | `unsafe-none` on the callback routes + localStorage handoff (§4.3) |
| `response_type` "is not allowed for this client" | Microsoft **ID tokens** checkbox not ticked | §3.2 |
| `ERR_JWT_CLAIM_VALIDATION_FAILED` on `aud` | client id differs between bundle and API | §5.2 |
| Sign-in buttons do nothing, no network call | `VITE_*` missing from the bundle | §5.1 |
| Empty 500 from `/api/auth/oauth` | `jose` v6 under CommonJS, or an undeclared variable under `'use strict'` | §5.3; lint the API, do not exclude it |
| `redirect_uri_mismatch` | URI not registered, or differs by a slash / `www` / port | §2.2 |
| "unverified app" warning (Microsoft) | publisher verification not completed | §3.4 — cosmetic |
| Google refuses to save the consent screen | logo upload triggers brand verification | remove the logo (§2.1) |
| Works for you, fails for a colleague | consent screen still in *Testing* | publish to Production, or add them as a test user |

---

## Reference files in this repo

| Concern | File |
|---|---|
| Authorize URLs, popup, handoff, state/nonce | [`src/lib/auth.ts`](../src/lib/auth.ts) |
| Callback route and fragment parsing | [`src/App.tsx`](../src/App.tsx) (`SsoCallback`) |
| JWKS verification for both providers | [`api/src/oauth.js`](../api/src/oauth.js) |
| Account upsert and session issuing | [`api/src/functions/auth.js`](../api/src/functions/auth.js) |
| COOP and CSP headers | [`staticwebapp.config.json`](../staticwebapp.config.json) |
| Build-time variable injection | [`.github/workflows/`](../.github/workflows/) |

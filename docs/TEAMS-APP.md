# SprintDeck in Microsoft Teams

SprintDeck ships as a Teams app: a personal tab, a channel/chat tab, and a meeting side panel.
Sign-in is silent — Teams already knows who the person is.

Everything in the code is done. What is left is **three settings in Entra** and **one upload**,
both of which only you can do.

- [What was built](#what-was-built)
- [Step 1 — Entra (10 minutes)](#step-1--entra-10-minutes)
- [Step 2 — fill in the manifest](#step-2--fill-in-the-manifest)
- [Step 3 — build the package](#step-3--build-the-package)
- [Step 4 — install it](#step-4--install-it)
- [Step 5 — check it works](#step-5--check-it-works)
- [Publishing beyond your tenant](#publishing-beyond-your-tenant)
- [Things to know](#things-to-know)

---

## What was built

| Piece | Where |
|---|---|
| Teams SDK wrapper — detect, theme, silent token | [`src/lib/teams.ts`](../src/lib/teams.ts) |
| Silent sign-in | `signInWithTeams()` in [`src/lib/auth.ts`](../src/lib/auth.ts) |
| Token verification | `verifyTeamsToken()` in [`api/src/oauth.js`](../api/src/oauth.js) |
| Sign-in endpoint | `POST /api/auth/teams` in [`api/src/functions/auth.js`](../api/src/functions/auth.js) |
| Tab configuration screen | [`src/components/TeamsConfig.tsx`](../src/components/TeamsConfig.tsx) → `/teams/config` |
| Embedding headers | [`staticwebapp.config.json`](../staticwebapp.config.json) |
| App manifest + icons | [`teams/`](../teams/) |

---

## Step 1 — Entra (10 minutes)

Use the **existing** SprintDeck registration — the one Microsoft sign-in already uses. Do not
create a second one.

**portal.azure.com → Microsoft Entra ID → App registrations → SprintDeck**

### 1.1 Expose an API

**Expose an API** → **Application ID URI** → **Set** →

```
api://sprintdeck.in/<your-client-id>
```

Azure offers `api://<client-id>`; change it to the form above. It must match `webApplicationInfo.resource`
in the manifest exactly.

### 1.2 Add the scope

**Add a scope** →

| Field | Value |
|---|---|
| Scope name | `access_as_user` |
| Who can consent | Admins and users |
| Admin consent display name | Access SprintDeck as you |
| Admin consent description | Allows Teams to call SprintDeck as the signed-in user. |
| User consent display name | Access SprintDeck as you |
| User consent description | Lets SprintDeck know who you are inside Teams. |
| State | Enabled |

### 1.3 Pre-authorize the Teams clients

Still on **Expose an API** → **Add a client application**, twice, ticking `access_as_user` each time:

```
1fec8e78-bce4-4aaf-ab1b-5451cc387264    Teams desktop and mobile
5e3ce6c0-2b1f-4285-8d4b-75ee78787346    Teams web
```

Without these, `getAuthToken()` fails with a consent error and there is no way for the user to fix
it themselves.

### 1.4 One app setting

Azure Portal → your Static Web App → **Configuration** → add:

```
TEAMS_APP_ID_URI = api://sprintdeck.in/<your-client-id>
```

The API falls back to `api://<APP_URL host>/<client id>` if it is absent, so this is belt and
braces — set it anyway, it is the value the token is actually checked against.

---

## Step 2 — fill in the manifest

Edit [`teams/manifest.json`](../teams/manifest.json) and replace both placeholders with your Entra
client id:

```jsonc
"webApplicationInfo": {
  "id": "<your-client-id>",
  "resource": "api://sprintdeck.in/<your-client-id>"
}
```

`id` at the top of the file is the **Teams app** id — a GUID unrelated to Entra. One is already
generated; keep it stable, because changing it makes Teams treat it as a different app and
everyone has to reinstall.

---

## Step 3 — build the package

```bash
npm run teams:package        # → teams/sprintdeck-teams.zip
```

The zip holds `manifest.json`, `color.png` (192×192) and `outline.png` (32×32, white on
transparent) at its root. Nested folders are rejected by Teams.

The zip is gitignored — it is a build output, rebuild it whenever the manifest changes.

---

## Step 4 — install it

### Your tenant, just you (development)

1. Teams → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**
2. Pick `teams/sprintdeck-teams.zip`

If "Upload a custom app" is missing, custom app uploading is off for the tenant: **Teams admin
center → Teams apps → Setup policies → Global → Upload custom apps → On**. It can take up to 24
hours to take effect, so switch it on before you need it.

### Your whole organisation

**Teams admin center → Teams apps → Manage apps → Upload new app**. It then appears in your org's
app catalogue under **Built for your org**. No Microsoft review.

---

## Step 5 — check it works

- [ ] Personal tab opens and you are **already signed in** — no login screen, no popup.
- [ ] Adding a tab to a channel shows the configuration screen with three ceremonies.
- [ ] Picking Retrospective and saving opens the retro on that tab.
- [ ] Dark Teams theme → SprintDeck is dark; switch Teams to light → it follows.
- [ ] Adding the app to a meeting gives a side panel that is usable at ~320px wide.
- [ ] The cookie banner and ads do **not** appear inside Teams.
- [ ] Signing in through Teams and through the browser lands on the **same** account and plan.

---

## Publishing beyond your tenant

To list SprintDeck in the Teams store, submit through **Partner Center**. That route requires
**publisher verification** — the same thing that currently shows an "unverified" warning during
Microsoft sign-in. Expect Microsoft's validation to also check accessibility, a working privacy
policy and terms (both already live), and app-behaviour guidelines.

Do the org-catalogue route first. It is instant, and it is how you will find the problems a store
reviewer would find.

---

## Things to know

**A Teams tab is a separate device.** Browser storage inside the Teams iframe is partitioned per
embedder, so the Teams tab does not share `sprintdeck.token` with the same person's browser. It
therefore takes one of the **three device slots** — someone signed in on a laptop browser, a phone
and Teams is already at the limit.

**Embedding traded away a header.** `X-Frame-Options: DENY` is gone and CSP `frame-ancestors` now
allows the Microsoft hosts. That is what makes a tab possible, but it is a real reduction in
clickjacking defence — only Microsoft's domains may frame the app, nothing else, and the rest of
the CSP is unchanged.

**Silent sign-in can decline.** The first time in a tenant, or when an admin has restricted
consent, `getAuthToken()` fails. The app falls back to the normal sign-in screen, which works
inside the tab for password accounts. The Google popup does not work in an iframe — inside Teams,
Microsoft is the practical path.

**The meeting side panel is narrow.** It gets the ≤560px layout: one column, a scrollable header
row, and no participant legend.

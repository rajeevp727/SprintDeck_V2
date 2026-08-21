# SprintDeck Enterprise — Feature Demo Guide

_Last updated: 2026-08-21_  
_Auto-refreshed every Friday when the product changed that week._  
_Live app: https://sprintdeck.in · Developed by [OmegaTechnologies](https://omega-technologies.in)_

This guide has **two sections**:

| Section | Purpose |
|---------|---------|
| **Features** | Stable product capabilities + older weekly updates promoted here |
| **Updated this week** | Only the current week’s changes |

Every Friday the bot **moves** last week’s “Updated this week” into **Features → Feature history**, then fills “Updated this week” with new commits.

---

# Features

## Demo setup (2 minutes)

| Item | Value |
|------|--------|
| URL | https://sprintdeck.in |
| Demo account | Your Master / lifetime login |
| Browser | Chrome or Edge (desktop + optional phone for UPI) |
| Backup | Pre-created room codes / whiteboard link if network is slow |

**Suggested path:** Landing → Login → Dashboard → one ceremony each → Upgrade modal → Profile.

---

## Landing & access

### What to show
- Brand hero: **SprintDeck**
- Feature overview: Planning Poker, Retrospective, Whiteboard, Team Chat
- **Cards / List** layout toggle
- CTAs: **Log in / Register** and **Continue as guest**

### Talking points
- Pre-login is marketing only; full workspace unlocks after login or guest.
- Timesheet and paid ceremony hosting require an account + plan where gated.

### Demo steps
1. Open https://sprintdeck.in  
2. Toggle Cards ↔ List  
3. Click **Log in / Register**

---

## Auth & profile

- Register / login (email + password)
- Remembered accounts
- Forgot password → email reset link (`/reset-password`)
- Profile menu: name, email, plan badge
- Edit profile (display name)
- Change password
- GDPR: **Download my data** / **Delete account**
- Theme toggle (light / dark)

### Demo steps
1. Sign in  
2. Open profile → show plan  
3. Open **Edit profile** briefly  
4. Toggle theme

---

## Dashboard (signed-in home)

| Card | Opens |
|------|--------|
| Sprint Planning | Create / join poker room |
| Sprint Retrospective | Start / join retro board |
| Daily Scrum & Timesheet | Standup log + export |
| Whiteboard | Create / join Miro-style canvas |

Footer: **SprintDeck - Developed by OmegaTechnologies** · Privacy · Terms · Security

---

## Planning Poker

- Create room (moderator) or join by code / link  
- Fibonacci-style vote deck; hidden votes until reveal  
- Consensus / average / stats  
- Manual tasks or connect a PM tool (Linear / Jira / Azure DevOps picker)  
- Confirm estimate and (where integrated) write-back  
- Results history + export (.txt / .csv / .json)  
- Team Chat (paid) inside the room  
- Live sync via short polling  

### Demo steps
1. Dashboard → **Sprint Planning** → create room  
2. Open join link in a second browser/incognito as a voter  
3. Cast votes → **Reveal** → show consensus  
4. Open results / export  

---

## Sprint Retrospective

- Create / join retro by code  
- Columns: what went well / to improve / actions  
- Review prior action items  
- Real-time board collaboration  

### Demo steps
1. Dashboard → **Sprint Retrospective** → start  
2. Add sticky notes in each column  
3. Join from a second device to show live updates  

---

## Daily Scrum & Timesheet

- Log daily standup notes and task hours  
- Copy / CSV handoff for Keka or other timesheets  

### Demo steps
1. Dashboard → **Daily Scrum & Timesheet**  
2. Add today’s entries  
3. Export / copy for timesheet tools  

---

## Whiteboard

- Infinite Miro-style canvas  
- Sticky notes, shapes, pen sketches  
- Live multiplayer presence  
- Presenter write control  
- Room-locked or shareable link  

### Demo steps
1. Dashboard → **Whiteboard** → create  
2. Draw / add stickies  
3. Open share link as a second participant  

---

## Team Chat

- Members-only back-channel in paid rooms  
- Replies & reactions  
- Realtime via Azure Web PubSub where configured  

---

## Plans & UPI payments

| Plan | Price / mo | Checkout (incl. ₹2 fee) |
|------|------------|-------------------------|
| Pro | ₹199 | ₹201 |
| Expert | ₹499 | ₹501 |
| Master | ₹999 | ₹1001 |

- Enterprise upgrade UI shows **Pro / Expert / Master only** (no Free card)  
- Prorated upgrades (difference + ₹2)  
- Standard UPI QR + auto-confirm via bank credit email ingest  
- App polls status ~every 1s; **I've paid — check now** available  
- Normal plans last **30 days**; owner lifetime grant is allowlisted to `mrrajeev18@gmail.com` only  

### Demo steps
1. Profile → **Manage** / **Upgrade**  
2. Show Pro / Expert / Master only  
3. Select a plan → show QR + amount  

---

## Compliance & trust

- Cookie consent gates AdSense  
- Privacy / Terms / Security pages  
- Account export & delete  
- Security headers / CSP on Azure Static Web Apps  

---

## Suggested 12-minute client script

| Min | Segment |
|-----|---------|
| 0–1 | Landing + brand |
| 1–2 | Login + plan profile |
| 2–5 | Planning poker (2 browsers) |
| 5–7 | Retro board |
| 7–8 | Timesheet |
| 8–10 | Whiteboard multiplayer |
| 10–12 | Plans + UPI QR story + Q&A |

---

## Feature history (promoted from prior weeks)

> Every Friday, the previous **Updated this week** block is moved here, then that section is refreshed.

<!-- FEATURES_HISTORY_START -->
### Seed — demo guide created (2026-08-12)
- Full feature demo walkthrough added
- Friday automation: promote last week → Features, refresh Updated this week

### Archived — Week of 2026-08-12 (moved 2026-08-21)
**Areas touched:** Plans & billing, Auth / compliance, Landing / branding, Whiteboard

**Highlights**
- Remove Free tier — Pro, Expert, Master only
- Restrict lifetime membership to owner email only
- Add lifetime membership for admin grants
- Enterprise compliance: GDPR, cookie consent, firewall hardening
- Bind Master subscription by email on login
- OmegaTechnologies developer credit in footer
- Restore 4 feature cards on landing page
- Password reset email + reset page
- Faster UPI payment confirmation polling

**Commits**
- `59288e2` Remove Free tier — Pro, Expert, Master only (#41)
- `7f2e386` Restrict lifetime membership to owner email only (#40)
- `1e32cf1` Add lifetime membership for admin grants (#39)
- `2f7412f` Enterprise compliance: GDPR, firewall hardening, cookie consent (#31)
- `2fb929f` Bind Master subscription by email on login (#35)
- `9d1a12f` Add omegatechnologies developer credit in dashboard footer (#34)
- `ecd5ebd` Restore 4 feature cards on landing page (#33)
- `269862c` Fix password reset: send email and add reset page (#32)

<!-- FEATURES_HISTORY_END -->

---

# Updated this week

> Current week only. Next Friday this block is **promoted into Features → Feature history**, then replaced.

<!-- UPDATED_THIS_WEEK_START -->

### Week of 2026-08-21
**Areas touched:** Whiteboard, Auth / compliance, Landing / branding

**Highlights**
- Deploy production only on push to main
- chore: add CI health marker for pipeline validation
- chore(deps-dev): bump eslint-plugin-react-refresh to 0.5.4
- chore(deps-dev): bump eslint from 10.8.0 to 10.8.1
- chore(deps-dev): bump typescript-eslint from 8.65.0 to 8.67.0
- chore(deps-dev): bump globals from 17.8.0 to 17.11.0
- chore(deps): bump jose from 6.2.8 to 6.2.9 in /api
- Auto-merge Dependabot PRs and close stale queue
- chore(deps): apply safe Dependabot updates
- chore(deps): bump actions/setup-node from 4 to 7
- chore(deps-dev): bump azure-functions-core-tools in /api
- chore(deps): bump actions/github-script from 7 to 9

**Commits**
- `9b328a4` Deploy production only on push to main (#79)
- `4f73e41` chore: add CI health marker for pipeline validation (#78)
- `43dc7bb` chore(deps-dev): bump eslint-plugin-react-refresh to 0.5.4 (#77)
- `fd0397d` chore(deps-dev): bump eslint from 10.8.0 to 10.8.1 (#76)
- `e93b291` chore(deps-dev): bump typescript-eslint from 8.65.0 to 8.67.0 (#74)
- `a0d1622` chore(deps-dev): bump globals from 17.8.0 to 17.11.0 (#73)
- `6cd924a` chore(deps): bump jose from 6.2.8 to 6.2.9 in /api (#72)
- `ee610d3` Auto-merge Dependabot PRs and close stale queue (#71)
- `e01b063` chore(deps): apply safe Dependabot updates (#70)
- `0d863ce` chore(deps): bump actions/setup-node from 4 to 7 (#11)
- `670f72c` chore(deps-dev): bump azure-functions-core-tools in /api (#69)
- `18734fe` chore(deps): bump actions/github-script from 7 to 9 (#68)
- `f833b92` Fix production deploy after auto-merge PRs
- `c4400ef` Skip whiteboard name screen for logged-in users (#66)
- `fc42e1e` Auto-start whiteboard with profile username from dashboard (#65)
- `1826b1d` Show theme toggle globally on every screen including auth (#64)
- `3d9df93` Apply unified auth card styling on mobile and desktop (#63)
- `28db2ea` Unify auth card to wrap email form and SSO buttons (#62)
- `ac907eb` Move SSO buttons below switch CTA on login and signup (#61)
- `1d1160f` Show Microsoft logo clearly on SSO sign-in button (#60)
- `349c489` Polish SSO login UI with brand-aligned Microsoft and Google buttons (#59)
- `3a0e3b0` Add memory.md agent playbook for context, standards, and auto-merge (#58)
- `75116d4` Harden auto-merge workflow against concurrent merge races (#57)
- `610cc7d` Improve auth UI/UX: unified SSO buttons and mobile layout (#56)
- `fdc53cf` Fix MSAL interaction_in_progress error on Microsoft sign-in
- …and 3 more commits

<!-- UPDATED_THIS_WEEK_END -->

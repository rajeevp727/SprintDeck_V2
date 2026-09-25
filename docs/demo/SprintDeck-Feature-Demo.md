# SprintDeck Enterprise — Feature Demo Guide

_Last updated: 2026-09-25_  
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
- Paid ceremony hosting requires an account + plan where gated.

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
| 5–8 | Retro board |
| 8–10 | Whiteboard multiplayer |
| 10–12 | Plans + UPI QR story + Q&A |

---

## Feature history (promoted from prior weeks)

> Every Friday, the previous **Updated this week** block is moved here, then that section is refreshed.

<!-- FEATURES_HISTORY_START -->
### Seed — demo guide created (2026-08-12)
- Full feature demo walkthrough added
- Friday automation: promote last week → Features, refresh Updated this week

### Archived — Week of 2026-08-12 (moved 2026-09-25)
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

### Week of 2026-09-25
**Areas touched:** Planning Poker, Retrospective, Whiteboard, Team Chat, Daily Scrum & Timesheet, Plans & billing, Auth / compliance, Landing / branding

**Highlights**
- feat(teams): ship SprintDeck as a Microsoft Teams app
- docs: add a reusable OAuth setup guide
- feat(dashboard): show Team Chat alongside the other ceremonies
- style: make the retro board and dashboard work at phone width
- feat(retro): past retrospectives page and a summary email to the host
- feat(retro): archive finished boards and hide notes until reveal
- refactor(router): pull retro path resolution out of computeRoute
- feat(retro): keep the board code out of the address bar
- style(retro): square off the people modal close button
- feat(auth): cap sign-ins at three devices and sync open rooms across them
- style(retro): keep the board header on one line
- fix(retro): keep the people modal open on a backdrop click

**Commits**
- `78a9ad9` feat(teams): ship SprintDeck as a Microsoft Teams app
- `2bbb144` docs: add a reusable OAuth setup guide
- `7f364df` feat(dashboard): show Team Chat alongside the other ceremonies
- `4e72ffc` style: make the retro board and dashboard work at phone width
- `0c0b8e7` feat(retro): past retrospectives page and a summary email to the host
- `a46da24` feat(retro): archive finished boards and hide notes until reveal
- `669abaf` refactor(router): pull retro path resolution out of computeRoute
- `a38750d` feat(retro): keep the board code out of the address bar
- `df08382` style(retro): square off the people modal close button
- `e83f612` feat(auth): cap sign-ins at three devices and sync open rooms across them
- `c41429b` style(retro): keep the board header on one line
- `71bc01e` fix(retro): keep the people modal open on a backdrop click
- `5ab0637` style(retro): close the people modal with an X
- `7325cc6` style: solid destructive buttons and the real logo on the retro screens
- `4e92f58` fix(retro): keep action items to the facilitator and show people in a modal
- `5863e6b` style(dashboard): pin the footer to the bottom and tighten the top gap
- `91f08ce` feat: withdraw the daily scrum and timesheet module
- `ec1fc28` feat(retro): show the compose hint once, on first hover
- `a37e414` style(retro): keep the default cursor on the compose hint
- `e52f73c` style(retro): fold the compose hint into an info icon
- `55bd5a6` style(retro): use a thumbs-up for carry-over likes
- `8ddb88d` feat(retro): carry last retro's action items and let the team like them
- `912d2a0` fix(retro): freeze discussion notes when voting stops
- `721c497` fix(retro): allow move to action only after voting stops
- `2645512` fix(retro): votes need a running clock, and the bar stays pinned when narrow
- …and 43 more commits

<!-- UPDATED_THIS_WEEK_END -->

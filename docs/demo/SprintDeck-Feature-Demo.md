# SprintDeck Enterprise — Feature Demo Guide

_Last updated: 2026-08-12_  
_Auto-refreshed every Friday when the product changed that week._  
_Live app: https://sprintdeck.in · Developed by [OmegaTechnologies](https://omega-technologies.in)_

Use this document to walk a client through **every major feature** in a live demo.

---

## 0. Demo setup (2 minutes)

| Item | Value |
|------|--------|
| URL | https://sprintdeck.in |
| Demo account | Your Master / lifetime login |
| Browser | Chrome or Edge (desktop + optional phone for UPI) |
| Backup | Pre-created room codes / whiteboard link if network is slow |

**Suggested path:** Landing → Login → Dashboard → one ceremony each → Upgrade modal → Profile.

---

## 1. Landing & access

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

## 2. Auth & profile

### Features
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
2. Open profile → show plan (**Master · Lifetime** on owner account)  
3. Open **Edit profile** briefly  
4. Toggle theme

---

## 3. Dashboard (signed-in home)

Four ceremony cards:

| Card | Opens |
|------|--------|
| Sprint Planning | Create / join poker room |
| Sprint Retrospective | Start / join retro board |
| Daily Scrum & Timesheet | Standup log + export |
| Whiteboard | Create / join Miro-style canvas |

Footer: **SprintDeck - Developed by OmegaTechnologies** · Privacy · Terms · Security

---

## 4. Planning Poker

### Features
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
5. (Optional) open Chat if plan allows  

---

## 5. Sprint Retrospective

### Features
- Create / join retro by code  
- Columns: what went well / to improve / actions  
- Review prior action items  
- Real-time board collaboration  

### Demo steps
1. Dashboard → **Sprint Retrospective** → start  
2. Add sticky notes in each column  
3. Join from a second device to show live updates  

---

## 6. Daily Scrum & Timesheet

### Features
- Log daily standup notes and task hours  
- Copy / CSV handoff for Keka or other timesheets  
- Local persistence for the signed-in session workflow  

### Demo steps
1. Dashboard → **Daily Scrum & Timesheet**  
2. Add today’s entries  
3. Export / copy for timesheet tools  

---

## 7. Whiteboard

### Features
- Infinite Miro-style canvas  
- Sticky notes, shapes, pen sketches  
- Live multiplayer presence  
- Presenter write control  
- Room-locked or shareable link  
- Export helpers  

### Demo steps
1. Dashboard → **Whiteboard** → create  
2. Draw / add stickies  
3. Open share link as a second participant  
4. Show presenter control if available  

---

## 8. Team Chat

### Features
- Members-only back-channel in paid rooms  
- Replies & reactions  
- Realtime via Azure Web PubSub where configured  

### Demo steps
1. From an active poker/retro room with an eligible plan  
2. Open chat → send a message → react  

---

## 9. Plans & UPI payments

### Plans (Enterprise)
| Plan | Price / mo | Checkout (incl. ₹2 fee) |
|------|------------|-------------------------|
| Pro | ₹199 | ₹201 |
| Expert | ₹499 | ₹501 |
| Master | ₹999 | ₹1001 |

- No Free card in the Enterprise upgrade UI  
- Prorated upgrades (difference + ₹2)  
- Standard UPI QR (`upi://pay?...`)  
- Auto-confirm via bank credit email → Gmail Apps Script → `/api/upi/ingest`  
- App polls status ~every 1s; **I've paid — check now** available  
- Subscriptions normally **30 days**; owner lifetime grant is allowlisted  

### Demo steps
1. Profile → **Manage** / **Upgrade**  
2. Show Pro / Expert / Master only  
3. Select Expert → show QR + amount  
4. Explain auto-confirm (or show already-active Master)  

---

## 10. Compliance & trust

- Cookie consent gates AdSense  
- Privacy / Terms / Security pages  
- Account export & delete  
- Security headers / CSP on Azure Static Web Apps  

### Demo steps
1. Footer → Privacy / Terms / Security  
2. (Optional) Profile → data export  

---

## 11. Suggested 12-minute client script

| Min | Segment |
|-----|---------|
| 0–1 | Landing + brand |
| 1–2 | Login + Master profile |
| 2–5 | Planning poker (2 browsers) |
| 5–7 | Retro board |
| 7–8 | Timesheet |
| 8–10 | Whiteboard multiplayer |
| 10–12 | Plans + UPI QR story + Q&A |

---

## 12. Weekly change log

> Updated automatically every **Friday** if `main` received non-docs product changes that week.

### 2026-08-12 — Initial demo pack
- Feature demo guide created covering all ceremonies, auth, billing, and compliance
- Weekly Friday automation added (see `.github/workflows/weekly-demo-docs.yml`)
- Recent product highlights reflected here: lifetime owner membership, Free tier removed from upgrade UI, faster UPI confirmation polling, OmegaTechnologies footer credit

### 2026-08-12 — Weekly update
**Areas touched:** Whiteboard, Plans & UPI payments, Auth / compliance, Landing / branding

**Commits this week:**
- `59288e2` Remove Free tier — Pro, Expert, Master only (#41)
- `7f2e386` Restrict lifetime membership to owner email only (#40)
- `1e32cf1` Add lifetime membership for admin grants (#39)
- `2f7412f` Enterprise compliance: GDPR, firewall hardening, cookie consent (#31)
- `2fb929f` Bind Master subscription by email on login (#35)
- `9d1a12f` Add omegatechnologies developer credit in dashboard footer (#34)
- `ecd5ebd` Restore 4 feature cards on landing page (#33)
- `269862c` Fix password reset: send email and add reset page (#32)
- `12e6dfc` Remove dead code, unused CSS, and strip comments (#30)
- `05c8a01` Add code quality gates, tests, and admin subscription grant script (#29)
- `2180f1a` CI: Aikido scans, auto-merge, and code optimizations (#28)
- `90b46f4` Add profile username fetch and edit from user menu (#27)
- `94af7c2` Enhance whiteboard start screen UI/UX (#26)
- `e4ea996` Show current subscription in profile menu (#25)
- `220aac6` Fix whiteboard start form layout and Pro subscription UX (#24)
- `6a07e25` Add shareable live whiteboard with presenter write control (#23)
- `ebf49c8` Upgrade whiteboard to Miro-style infinite canvas (#22)
- `deb9c7d` feat: validate email and show user-not-found in forgot-password
- `030cdd7` feat: add forgot-password flow with email link
- `44527b2` feat: auth page-turn top/bottom only on mobile
- `d2d70b1` fix: show password hint tooltip on click/tap for mobile
- `92c5721` fix: set workerRuntime node in host.json for local func start
- `aa5e9aa` style: use default cursor on password info icon
- `373eb5b` style: move password toggle hint to info icon
- `c5751a9` feat: add whiteboard and auth page-turn animations
- …and 3 more commits

<!-- WEEKLY_UPDATES_INSERT_POINT -->

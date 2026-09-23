import { app as teamsApp, authentication } from '@microsoft/teams-js';

// Derived rather than imported: the SDK exports two `Context` types and only
// the one getContext() returns carries the meeting and channel fields.
type TeamsContext = Awaited<ReturnType<typeof teamsApp.getContext>>;

// Running inside Teams changes three things: Teams draws the window chrome, the
// theme comes from Teams rather than our toggle, and sign-in is silent — the
// popup flow cannot work in an embedded frame.

let context: TeamsContext | null = null;
let ready: Promise<boolean> | null = null;

/** True when the page is framed by a Teams client, which is worth knowing early. */
export function looksLikeTeams(): boolean {
  if (new URLSearchParams(location.search).has('teams')) return true;
  if (window.self === window.top) return false;
  return /teams\.microsoft\.com|teams\.cloud\.microsoft|\.office\.com|\.skype\.com/.test(
    document.referrer || '',
  );
}

/**
 * Initialises the SDK once. Resolves false anywhere that is not Teams, so
 * callers can treat it as a plain feature check.
 */
export function initTeams(): Promise<boolean> {
  if (ready) return ready;
  if (!looksLikeTeams()) {
    ready = Promise.resolve(false);
    return ready;
  }
  ready = teamsApp
    .initialize()
    .then(() => teamsApp.getContext())
    .then((ctx) => {
      context = ctx;
      applyTeamsTheme(ctx.app.theme);
      teamsApp.registerOnThemeChangeHandler(applyTeamsTheme);
      teamsApp.notifySuccess();
      return true;
    })
    .catch(() => false);
  return ready;
}

export function teamsContext(): TeamsContext | null {
  return context;
}

/** Teams owns the theme inside its client; ours would fight it. */
function applyTeamsTheme(theme: string) {
  const dark = theme === 'dark' || theme === 'contrast';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/**
 * The single sign-on token for this tab. Teams issues it silently for a user
 * who has already consented; the first time, it throws and the caller falls
 * back to the ordinary sign-in screen.
 */
export async function teamsAuthToken(): Promise<string> {
  if (!(await initTeams())) return '';
  try {
    return await authentication.getAuthToken();
  } catch {
    return '';
  }
}

/** The meeting a side-panel tab is pinned to, when there is one. */
export function teamsMeetingId(): string {
  return context?.meeting?.id || '';
}

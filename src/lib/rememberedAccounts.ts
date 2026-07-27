// Locally-remembered sign-in accounts, so the login screen can suggest who has
// signed in before (Instagram-style). We store ONLY the email + display name —
// never a password or token. Most-recently-used first, capped to a handful.
export interface RememberedAccount {
  email: string;
  name?: string;
}

const KEY = 'sprintdeck.accounts';
const MAX = 5;

export function getAccounts(): RememberedAccount[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((a) => a && typeof a.email === 'string') : [];
  } catch {
    return [];
  }
}

function save(list: RememberedAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

// Record (or bump to the front) an account after a successful sign in.
export function rememberAccount(account: RememberedAccount) {
  const email = account.email.trim();
  if (!email) return;
  const rest = getAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase());
  save([{ email, name: account.name?.trim() || undefined }, ...rest]);
}

// Forget one suggestion (the ✕ on a row).
export function forgetAccount(email: string) {
  save(getAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase()));
}

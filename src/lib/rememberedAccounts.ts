

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
  } catch { void 0; }
}

export function rememberAccount(account: RememberedAccount) {
  const email = account.email.trim();
  if (!email) return;
  const rest = getAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase());
  save([{ email, name: account.name?.trim() || undefined }, ...rest]);
}

export function forgetAccount(email: string) {
  save(getAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase()));
}

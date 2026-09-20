

const KEY = 'pp.identity';

type IdentityMap = Record<string, { participantId: string; name: string }>;

function read(): IdentityMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveIdentity(code: string, participantId: string, name: string) {
  const map = read();
  map[code.toUpperCase()] = { participantId, name };
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getIdentity(code: string) {
  return read()[code.toUpperCase()] || null;
}

export function clearIdentity(code: string) {
  const map = read();
  delete map[code.toUpperCase()];
  localStorage.setItem(KEY, JSON.stringify(map));
}

const currentRoomKey = 'pp.currentRoom';

export function setCurrentRoom(code: string) {
  localStorage.setItem(currentRoomKey, code.toUpperCase());
}

export function getCurrentRoom(): string | null {
  return localStorage.getItem(currentRoomKey);
}

export function clearCurrentRoom() {
  localStorage.removeItem(currentRoomKey);
}

const seenHintsKey = 'pp.seenHints';

/** A one-off hint: shown the first time someone meets it, then never again. */
export function hintSeen(id: string): boolean {
  try {
    return (localStorage.getItem(seenHintsKey) || '').split(',').includes(id);
  } catch {
    return true;
  }
}

export function markHintSeen(id: string) {
  try {
    const seen = (localStorage.getItem(seenHintsKey) || '').split(',').filter(Boolean);
    if (seen.includes(id)) return;
    localStorage.setItem(seenHintsKey, [...seen, id].join(','));
  } catch {
    // A browser that refuses storage just shows the hint again — harmless.
  }
}

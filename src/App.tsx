import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import Privacy from './components/Privacy';
import Terms from './components/Terms';
import Security from './components/Security';
import StickyAd from './components/StickyAd';
import {
  getIdentity,
  getCurrentRoom,
  setCurrentRoom,
  clearCurrentRoom,
} from './storage';
import { applyOwnerUnlock } from './subscription';

type Route =
  | { kind: 'room'; code: string }
  | { kind: 'privacy' }
  | { kind: 'terms' }
  | { kind: 'security' }
  | { kind: 'home'; joinCode?: string };

// The room code is NOT kept in the URL — it lives in storage (see storage.ts).
// Invite links carry the code as a ?room=CODE query param, which is read on
// open and then stripped from the address bar. A legacy /room-CODE path is also
// honored. Otherwise the room resumes from storage; the visible URL stays "/".
function codeFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('room') || '').toUpperCase();
  if (fromQuery) return fromQuery;
  const legacy = window.location.pathname.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  return legacy ? legacy[1].toUpperCase() : '';
}

function computeRoute(): Route {
  const path = window.location.pathname;
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };
  if (path === '/terms' || path === '/terms/') return { kind: 'terms' };
  if (path === '/security' || path === '/security/') return { kind: 'security' };

  const code = codeFromUrl();
  if (code) {
    if (getIdentity(code)) {
      setCurrentRoom(code);
      return { kind: 'room', code };
    }
    return { kind: 'home', joinCode: code };
  }

  const current = getCurrentRoom();
  if (current && getIdentity(current)) return { kind: 'room', code: current };
  return { kind: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(computeRoute);

  useEffect(() => {
    // Owner bypass: ?unlock=<code> activates the paid plan for this browser
    // (read before the search string is stripped just below).
    if (applyOwnerUnlock()) {
      window.alert('Owner plan activated — subscription unlocked on this browser.');
    }
    // Strip the code (query param or legacy path) out of the address bar.
    if (window.location.search || /^\/room-/.test(window.location.pathname)) {
      window.history.replaceState({}, '', '/');
    }
    const onPop = () => setRoute(computeRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(path: string, next: Route, replace = false) {
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    setRoute(next);
  }
  function goRoom(code: string) {
    setCurrentRoom(code);
    go('/', { kind: 'room', code: code.toUpperCase() }, true); // clean URL, no code
  }
  function goHome() {
    clearCurrentRoom();
    go('/', { kind: 'home' }, true);
  }
  function goPrivacy() {
    go('/privacy', { kind: 'privacy' });
  }
  function goTerms() {
    go('/terms', { kind: 'terms' });
  }
  function goSecurity() {
    go('/security', { kind: 'security' });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'terms') {
    page = <Terms onBack={goHome} />;
  } else if (route.kind === 'security') {
    page = <Security onBack={goHome} />;
  } else if (route.kind === 'room') {
    page = (
      <Room
        code={route.code}
        onLeave={goHome}
        onMissingIdentity={goHome}
        onGoRoom={() => goRoom(route.code)}
      />
    );
  } else {
    page = (
      <Home
        initialCode={route.joinCode}
        onEnter={goRoom}
        onPrivacy={goPrivacy}
        onTerms={goTerms}
        onSecurity={goSecurity}
      />
    );
  }

  return (
    <>
      {page}
      <StickyAd />
    </>
  );
}

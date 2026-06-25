import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import Privacy from './components/Privacy';
import StickyAd from './components/StickyAd';
import { getIdentity } from './storage';

type Route = { kind: 'room'; code: string } | { kind: 'privacy' } | { kind: 'home' };

// Path router (clean URLs, no hash). Rooms live at /room-CODE, privacy at /privacy.
// Deep links work because Static Web Apps rewrites unknown paths to index.html.
function parsePath(): Route {
  const path = window.location.pathname;
  const m = path.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  if (m) return { kind: 'room', code: m[1].toUpperCase() };
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };
  return { kind: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parsePath());

  useEffect(() => {
    const onPop = () => setRoute(parsePath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // pushState doesn't fire popstate, so update React state alongside it.
  function navigate(path: string, next: Route) {
    window.history.pushState({}, '', path);
    setRoute(next);
  }
  function goRoom(code: string) {
    navigate(`/room-${code}`, { kind: 'room', code: code.toUpperCase() });
  }
  function goHome() {
    navigate('/', { kind: 'home' });
  }
  function goPrivacy() {
    navigate('/privacy', { kind: 'privacy' });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'room' && getIdentity(route.code)) {
    page = <Room code={route.code} onLeave={goHome} onMissingIdentity={() => setRoute({ ...route })} />;
  } else if (route.kind === 'room') {
    // Opened an invite link without having joined yet → prefill join form.
    page = <Home initialCode={route.code} onEnter={goRoom} onPrivacy={goPrivacy} />;
  } else {
    page = <Home onEnter={goRoom} onPrivacy={goPrivacy} />;
  }

  return (
    <>
      {page}
      <StickyAd />
    </>
  );
}

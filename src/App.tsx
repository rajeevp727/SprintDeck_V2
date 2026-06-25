import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import Privacy from './components/Privacy';
import StickyAd from './components/StickyAd';
import { getIdentity } from './storage';

type Route = { kind: 'room'; code: string } | { kind: 'privacy' } | { kind: 'home' };

// Tiny hash router. Room codes may contain letters, digits and dashes.
function parseHash(): Route {
  const m = window.location.hash.match(/^#\/room\/([A-Za-z0-9-]+)/);
  if (m) return { kind: 'room', code: m[1].toUpperCase() };
  if (window.location.hash.startsWith('#/privacy')) return { kind: 'privacy' };
  return { kind: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function goRoom(code: string) {
    // Setting the same hash won't fire 'hashchange', so update state directly too.
    window.location.hash = `/room/${code}`;
    setRoute({ kind: 'room', code: code.toUpperCase() });
  }
  function goHome() {
    window.location.hash = '';
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'room' && getIdentity(route.code)) {
    page = <Room code={route.code} onLeave={goHome} onMissingIdentity={() => setRoute({ ...route })} />;
  } else if (route.kind === 'room') {
    // Opened an invite link without having joined yet → prefill join form.
    page = <Home initialCode={route.code} onEnter={goRoom} />;
  } else {
    page = <Home onEnter={goRoom} />;
  }

  return (
    <>
      {page}
      <StickyAd />
    </>
  );
}

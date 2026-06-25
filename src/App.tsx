import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import StickyAd from './components/StickyAd';
import { getIdentity } from './storage';

// Tiny hash router: "#/room/ABCDE" → room view, anything else → home.
function parseHash(): { code: string } | null {
  const m = window.location.hash.match(/^#\/room\/([A-Za-z0-9]+)/);
  return m ? { code: m[1].toUpperCase() } : null;
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function goRoom(code: string) {
    // Setting the same hash won't fire 'hashchange', so update state directly too.
    window.location.hash = `/room/${code}`;
    setRoute({ code: code.toUpperCase() });
  }
  function goHome() {
    window.location.hash = '';
  }

  let page;
  if (route && getIdentity(route.code)) {
    page = <Room code={route.code} onLeave={goHome} onMissingIdentity={() => setRoute({ ...route })} />;
  } else if (route) {
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

import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '../lib/consent';

interface Props {
  onPrivacy: () => void;
}

export default function CookieConsent({ onPrivacy }: Props) {
  const [visible, setVisible] = useState(() => getConsent() === null);

  useEffect(() => {
    if (getConsent() !== null) setVisible(false);
  }, []);

  if (!visible) return null;

  function accept() {
    setConsent('accepted');
    setVisible(false);
  }

  function reject() {
    setConsent('rejected');
    setVisible(false);
  }

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <div className="cookie-consent-inner">
        <p>
          We use essential local storage for sessions and accounts. Optional Google AdSense cookies are
          only loaded if you accept. See our{' '}
          <button type="button" className="linkish" onClick={onPrivacy}>
            Privacy Policy
          </button>{' '}
          for details and your rights (access, erasure, portability).
        </p>
        <div className="cookie-consent-actions">
          <button type="button" className="ghost" onClick={reject}>
            Reject non-essential
          </button>
          <button type="button" className="primary" onClick={accept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

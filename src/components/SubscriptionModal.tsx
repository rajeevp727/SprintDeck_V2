import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TIERS, UPI_ID, upiLink, setSubscription, type TierId } from '../subscription';
import { CloseIcon } from './icons';

interface Props {
  onClose: () => void;
  onSubscribed: (tier: TierId) => void;
}

type PayState = 'pending' | 'expired' | 'success';
const PAY_WINDOW = 120; // seconds the QR stays valid before it must be regenerated

export default function SubscriptionModal({ onClose, onSubscribed }: Props) {
  const [selected, setSelected] = useState<TierId | null>(null);
  const [payState, setPayState] = useState<PayState>('pending');
  const [seconds, setSeconds] = useState(PAY_WINDOW);
  const tier = TIERS.find((t) => t.id === selected) ?? null;

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Countdown while a QR is showing. When it hits 0 the QR expires (Retry to reset).
  useEffect(() => {
    if (!tier || payState !== 'pending') return;
    if (seconds <= 0) {
      setPayState('expired');
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [tier, payState, seconds]);

  // After showing the success screen, activate the plan and close.
  useEffect(() => {
    if (payState !== 'success' || !tier) return;
    const id = setTimeout(() => onSubscribed(tier.id), 1800);
    return () => clearTimeout(id);
  }, [payState, tier, onSubscribed]);

  function pickTier(id: TierId) {
    setSelected(id);
    setSeconds(PAY_WINDOW);
    setPayState('pending');
  }

  function retry() {
    setSeconds(PAY_WINDOW);
    setPayState('pending');
  }

  function activate() {
    if (!tier) return;
    setSubscription(tier.id);
    setPayState('success');
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const timerClass = seconds > 60 ? 'timer-ok' : seconds > 30 ? 'timer-warn' : 'timer-danger';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close" title="Close">
          <CloseIcon />
        </button>

        {!tier ? (
          <>
            <h3>Choose a plan</h3>
            <p className="auth-sub">SprintDeck Enterprise — pick a plan to unlock the workspace.</p>
            <div className="tier-grid tier-grid-4">
              <a className="tier-card tier-free" href="https://sprintdeck.rajeevstech.in">
                <span className="tier-name">Free</span>
                <span className="tier-price">
                  ₹0<small>/mo</small>
                </span>
                <span className="tier-tagline">Plain planning poker</span>
                <ul className="tier-feats">
                  <li>Unlimited rooms &amp; voters</li>
                  <li>Vote, reveal &amp; consensus</li>
                  <li>Light / dark theme</li>
                  <li>No tool integrations</li>
                </ul>
                <span className="tier-cta">Use SprintDeck Free →</span>
              </a>
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  className={`tier-card${t.highlight ? ' tier-hot' : ''}`}
                  onClick={() => pickTier(t.id)}
                >
                  {t.highlight && <span className="tier-badge">Popular</span>}
                  <span className="tier-name">{t.name}</span>
                  <span className="tier-price">
                    ₹{t.price}
                    <small>/mo</small>
                  </span>
                  <span className="tier-tagline">{t.tagline}</span>
                  <ul className="tier-feats">
                    {t.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <span className="tier-cta">Choose {t.name}</span>
                </button>
              ))}
            </div>
            <button className="ghost sub-later" onClick={onClose}>
              Maybe later
            </button>
          </>
        ) : (
          <div className="pay-step">
            <button className="ghost pay-back" onClick={() => setSelected(null)}>
              ← Plans
            </button>
            <h3>
              {tier.name} · ₹{tier.price}/mo
            </h3>

            {payState === 'success' ? (
              <div className="pay-success">
                <div className="pay-check" aria-hidden>✓</div>
                <p className="pay-success-title">Payment successful</p>
                <p className="auth-sub">{tier.name} plan activated — enjoy SprintDeck Enterprise!</p>
              </div>
            ) : !UPI_ID ? (
              <p className="linear-notice">Payments aren&rsquo;t configured yet (set VITE_UPI_ID).</p>
            ) : payState === 'expired' ? (
              <div className="pay-expired">
                <div className="pay-expired-icon" aria-hidden>⏱</div>
                <p className="pay-expired-title">QR expired</p>
                <p className="auth-sub">The payment window timed out. Generate a fresh QR to try again.</p>
                <button className="primary auth-wide" onClick={retry}>
                  Retry payment
                </button>
              </div>
            ) : (
              <>
                <p className="auth-sub">Scan with any UPI app to pay, then confirm below.</p>
                <div className="qr-wrap">
                  <QRCodeSVG value={upiLink(tier.price, `SprintDeck ${tier.name}`)} size={176} marginSize={2} />
                </div>
                <p className={`pay-timer ${timerClass}`}>
                  Expires in <strong>{mmss}</strong>
                </p>
                <p className="upi-vpa">{UPI_ID}</p>
                <a className="primary auth-wide" href={upiLink(tier.price, `SprintDeck ${tier.name}`)}>
                  Pay ₹{tier.price} via UPI
                </a>
                <button className="ghost auth-wide" onClick={activate}>
                  I&rsquo;ve paid — activate
                </button>
                <p className="auth-hint">Activation is manual for now (UPI has no auto-confirmation).</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

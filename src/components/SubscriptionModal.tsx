import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TIERS, UPI_ID, upiLink, setSubscription, type TierId } from '../subscription';
import { CloseIcon } from './icons';

interface Props {
  onClose: () => void;
  onSubscribed: (tier: TierId) => void;
}

export default function SubscriptionModal({ onClose, onSubscribed }: Props) {
  const [selected, setSelected] = useState<TierId | null>(null);
  const tier = TIERS.find((t) => t.id === selected) ?? null;

  function activate() {
    if (!tier) return;
    setSubscription(tier.id);
    onSubscribed(tier.id);
  }

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
            <div className="tier-grid">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  className={`tier-card${t.highlight ? ' tier-hot' : ''}`}
                  onClick={() => setSelected(t.id)}
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
            {UPI_ID ? (
              <>
                <p className="auth-sub">Scan with any UPI app to pay, then confirm below.</p>
                <div className="qr-wrap">
                  <QRCodeSVG value={upiLink(tier.price, `SprintDeck ${tier.name}`)} size={176} marginSize={2} />
                </div>
                <p className="upi-vpa">{UPI_ID}</p>
                <a className="primary auth-wide" href={upiLink(tier.price, `SprintDeck ${tier.name}`)}>
                  Pay ₹{tier.price} via UPI
                </a>
                <button className="ghost auth-wide" onClick={activate}>
                  I&rsquo;ve paid — activate
                </button>
                <p className="auth-hint">Activation is manual for now (UPI has no auto-confirmation).</p>
              </>
            ) : (
              <p className="linear-notice">Payments aren&rsquo;t configured yet (set VITE_UPI_ID).</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

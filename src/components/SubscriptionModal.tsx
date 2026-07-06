import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  TIERS,
  UPI_ID,
  upiLink,
  setSubscription,
  setPendingOrder,
  clearPendingOrder,
  getActiveSubscription,
  tierPrice,
  amountForTier,
  type TierId,
} from '../subscription';
import { createOrder, getStatus, type PaymentOrder } from '../verifier';
import { CloseIcon, InfoIcon } from './icons';

interface Props {
  onClose: () => void;
}

// 'loading'      — creating the order
// 'pending'      — QR shown, polling for payment
// 'confirmed'    — verifier matched the payment → plan activated
// 'regenerating' — window elapsed → show "regenerating" for 5s, then auto-new QR
// 'error'        — couldn't reach the verifier / payments not configured
type PayState = 'loading' | 'pending' | 'confirmed' | 'regenerating' | 'error';

const PAY_WINDOW = 90; // seconds the QR stays visible (1:30); the background watcher still confirms late payments
const POLL_MS = 3000;
const REGEN_MS = 5000; // how long the "regenerating" state shows before a fresh QR

// QR-sized placeholder with a centered spinner (reserves the QR's exact space
// while loading/regenerating — no layout shift on load).
function QrSkeleton() {
  return (
    <div className="qr-skeleton" aria-label="Loading QR code" role="img">
      <span className="qr-loader" aria-hidden />
    </div>
  );
}

export default function SubscriptionModal({ onClose }: Props) {
  const [selected, setSelected] = useState<TierId | null>(null);
  const [payState, setPayState] = useState<PayState>('loading');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [seconds, setSeconds] = useState(PAY_WINDOW);
  const [errMsg, setErrMsg] = useState('');
  const tier = TIERS.find((t) => t.id === selected) ?? null;

  // When the selected tier is a mid-subscription upgrade, the amount is reduced
  // to the balance (new − current). Details drive the info icon + formula.
  const activeSub = getActiveSubscription();
  const upgrade =
    tier && activeSub && tier.price > tierPrice(activeSub.tier)
      ? {
          curr: tierPrice(activeSub.tier),
          currName: TIERS.find((x) => x.id === activeSub.tier)?.name ?? activeSub.tier,
          diff: tier.price - tierPrice(activeSub.tier),
        }
      : null;

  // "Pay ₹X" line — with an info icon + formula when the amount is a reduced upgrade balance.
  const renderPayAmount = (amount: number) => (
    <>
      <p className="pay-amount">
        Pay <strong>₹{amount.toFixed(2)}</strong>
        {upgrade && tier && (
          <span
            className="pay-info"
            title={`Reduced upgrade balance: ${tier.name} ₹${tier.price} − ${upgrade.currName} ₹${upgrade.curr} = ₹${upgrade.diff}`}
            aria-label="Why this amount is reduced"
          >
            <InfoIcon />
          </span>
        )}
      </p>
    </>
  );

  // Esc: on the pay step go BACK to the plans list; on the plans list, close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) {
        setSelected(null);
        setOrder(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  // Countdown while a QR is showing. When it hits 0, go to 'regenerating'.
  useEffect(() => {
    if (payState !== 'pending') return;
    if (seconds <= 0) {
      setPayState('regenerating');
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [payState, seconds]);

  // After the window elapses, show "regenerating" briefly, then auto-create a fresh QR.
  useEffect(() => {
    if (payState !== 'regenerating' || !tier) return;
    const id = setTimeout(() => startPayment(tier.id, amountForTier(tier.id)), REGEN_MS);
    return () => clearTimeout(id);
  }, [payState, tier]);

  // Poll the verifier for payment while the QR is live. On a match, activate the
  // plan locally and show the success screen.
  useEffect(() => {
    if (payState !== 'pending' || !order || !selected) return;
    const poll = async () => {
      if (document.hidden) return; // pause while backgrounded (e.g. in your UPI app)
      try {
        const { status } = await getStatus(order.orderId);
        if (status === 'confirmed') {
          setSubscription(selected);
          clearPendingOrder();
          setPayState('confirmed');
        } else if (status === 'expired') {
          setPayState('regenerating');
        }
      } catch {
        /* transient — keep polling until the window elapses */
      }
    };
    const id = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll(); // check immediately on returning from the UPI app
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [payState, order, selected]);

  // After the success screen, close.
  useEffect(() => {
    if (payState !== 'confirmed') return;
    const id = setTimeout(onClose, 1800);
    return () => clearTimeout(id);
  }, [payState, onClose]);

  // Pick a tier → create an order for `amount` (full price, or upgrade balance).
  async function startPayment(id: TierId, amount: number) {
    setSelected(id);
    setSeconds(PAY_WINDOW);
    setErrMsg('');
    setPayState('loading');
    try {
      // Wait for the order AND let the loader ring fill fully (~1.5s) before
      // revealing the QR.
      const [o] = await Promise.all([
        createOrder(id, amount),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      setOrder(o);
      setPendingOrder(o.orderId, id); // persist so it activates even after the modal closes
      setPayState('pending');
    } catch (e) {
      setErrMsg((e as Error).message);
      setPayState('error');
    }
  }

  function retry() {
    if (tier) startPayment(tier.id, amountForTier(tier.id));
  }

  function backToPlans() {
    setSelected(null);
    setOrder(null);
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
              <a
                className="tier-card tier-free"
                href="https://sprintdeck.rajeevstech.in"
                target="_blank"
                rel="noreferrer"
              >
                <span className="tier-icon" aria-hidden>♠</span>
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
              {TIERS.map((t) => {
                const active = getActiveSubscription();
                const isCurrent = active?.tier === t.id;
                const isLower = !!active && t.price < tierPrice(active.tier);
                const amount = amountForTier(t.id);
                const cta = isCurrent
                  ? 'Current plan'
                  : isLower
                    ? 'Included'
                    : active
                      ? `Upgrade · pay ₹${amount}`
                      : `Choose ${t.name}`;
                return (
                  <button
                    key={t.id}
                    className={`tier-card${t.highlight ? ' tier-hot' : ''}${isCurrent ? ' tier-current' : ''}`}
                    disabled={isCurrent || isLower}
                    onClick={() => startPayment(t.id, amount)}
                  >
                    {t.highlight && <span className="tier-badge">Popular</span>}
                    <span className="tier-icon" aria-hidden>{t.icon}</span>
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
                    <span className="tier-cta">{cta}</span>
                  </button>
                );
              })}
            </div>
            <button className="ghost sub-later" onClick={onClose}>
              Maybe later
            </button>
          </>
        ) : (
          <div className="pay-step">
            <button className="ghost pay-back" onClick={backToPlans}>
              ← Plans
            </button>
            <h3>
              {tier.name} · ₹{tier.price}/mo
            </h3>

            {payState === 'confirmed' ? (
              <div className="pay-success">
                <div className="pay-check" aria-hidden>✓</div>
                <p className="pay-success-title">Payment received</p>
                <p className="auth-sub">{tier.name} plan activated — enjoy SprintDeck Enterprise!</p>
              </div>
            ) : payState === 'loading' ? (
              <>
                <p className="auth-sub">Preparing your payment…</p>
                <div className="qr-wrap">
                  <QrSkeleton />
                </div>
                {renderPayAmount(amountForTier(tier.id))}
              </>
            ) : payState === 'regenerating' ? (
              <>
                <p className="auth-sub">QR expired — regenerating…</p>
                <div className="qr-wrap">
                  <QrSkeleton />
                </div>
                {renderPayAmount(amountForTier(tier.id))}
                <p className="auth-hint">A fresh QR appears in a moment.</p>
              </>
            ) : payState === 'error' ? (
              <div className="pay-expired">
                <div className="pay-expired-icon" aria-hidden>⚠</div>
                <p className="pay-expired-title">Couldn&rsquo;t start payment</p>
                <p className="auth-sub">{errMsg || 'The payment service is unavailable. Try again.'}</p>
                <button className="primary auth-wide" onClick={retry}>
                  Try again
                </button>
              </div>
            ) : payState === 'pending' && order && UPI_ID ? (
              <>
                <p className="auth-sub">Scan with any UPI app. We&rsquo;ll confirm automatically.</p>
                <p className="upi-vpa">{UPI_ID}</p>
                <div className="qr-wrap">
                  <QRCodeSVG value={upiLink(order.payAmount, `SprintDeck ${tier.name}`)} size={176} marginSize={2} />
                </div>
                <p className={`pay-timer ${timerClass}`}>
                  Waiting for payment · <strong>{mmss}</strong>
                </p>
                {renderPayAmount(order.payAmount)}
                <p className="auth-hint">Once your payment lands, this confirms automatically.</p>
              </>
            ) : payState === 'pending' ? (
              <p className="linear-notice">Payments aren&rsquo;t configured yet (set VITE_UPI_ID / the UPI_ID secret).</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

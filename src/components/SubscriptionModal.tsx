import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  tiers,
  upiId,
  upiLink,
  setSubscriptionRef,
  refreshSubscription,
  setPendingOrder,
  clearPendingOrder,
  getActiveSubscription,
  tierPrice,
  amountForTier,
  platformFee,
  type TierId,
} from '../lib/subscription';
import { createOrder, getStatus, type PaymentOrder } from '../lib/verifier';
import { CloseIcon, InfoIcon } from './icons';

interface Props {
  onClose: () => void;
}

type PayState = 'loading' | 'pending' | 'confirmed' | 'regenerating' | 'error';

const payWindow = 90; 
const pollMs = 3000;
const regenMs = 5000; 

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
  const [seconds, setSeconds] = useState(payWindow);
  const [errMsg, setErrMsg] = useState('');
  const tier = tiers.find((t) => t.id === selected) ?? null;

  const activeSub = getActiveSubscription();
  const feeInfo = tier
    ? (() => {
        const isUpgrade = !!activeSub && tier.price > tierPrice(activeSub.tier);
        const curr = isUpgrade ? tierPrice(activeSub!.tier) : 0;
        const currName = isUpgrade ? tiers.find((x) => x.id === activeSub!.tier)?.name ?? activeSub!.tier : '';
        const base = isUpgrade ? tier.price - curr : tier.price;
        const title = isUpgrade
          ? `${tier.name} ₹${tier.price} − ${currName} ₹${curr} + ₹${platformFee} platform fee = ₹${base + platformFee}`
          : `₹${tier.price} plan + ₹${platformFee} platform fee = ₹${base + platformFee}`;
        return { title };
      })()
    : null;

  const renderPayAmount = (amount: number) => (
    <p className="pay-amount">
      Pay <strong>₹{amount.toFixed(2)}</strong>
      {feeInfo && (
        <span className="pay-info" title={feeInfo.title} aria-label="Amount breakdown">
          <InfoIcon />
        </span>
      )}
    </p>
  );

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

  
  useEffect(() => {
    if (payState !== 'pending') return;
    if (seconds <= 0) {
      setPayState('regenerating');
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [payState, seconds]);

  
  useEffect(() => {
    if (payState !== 'regenerating' || !tier) return;
    const id = setTimeout(() => startPayment(tier.id, amountForTier(tier.id)), regenMs);
    return () => clearTimeout(id);
  }, [payState, tier]);

  
  
  useEffect(() => {
    if (payState !== 'pending' || !order || !selected) return;
    const poll = async () => {
      if (document.hidden) return; 
      try {
        const { status } = await getStatus(order.orderId);
        if (status === 'confirmed') {
          setSubscriptionRef(order.orderId); 
          await refreshSubscription();
          clearPendingOrder();
          setPayState('confirmed');
        } else if (status === 'expired') {
          setPayState('regenerating');
        }
      } catch { void 0; }
    };
    const id = setInterval(poll, pollMs);
    const onVisible = () => {
      if (!document.hidden) poll(); 
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [payState, order, selected]);

  
  useEffect(() => {
    if (payState !== 'confirmed') return;
    const id = setTimeout(onClose, 1800);
    return () => clearTimeout(id);
  }, [payState, onClose]);

  
  async function startPayment(id: TierId, amount: number) {
    setSelected(id);
    setSeconds(payWindow);
    setErrMsg('');
    setPayState('loading');
    try {
      
      
      const [o] = await Promise.all([
        createOrder(id, amount),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      setOrder(o);
      setPendingOrder(o.orderId, id); 
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
            <p className="auth-sub">SprintDeck Enterprise — pick Pro, Expert, or Master.</p>
            <div className="tier-grid">
              {tiers.map((t) => {
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
            ) : payState === 'pending' && order && upiId ? (
              <>
                <p className="auth-sub">Scan with any UPI app. We&rsquo;ll confirm automatically.</p>
                <p className="upi-vpa">{upiId}</p>
                <div className="qr-wrap">
                  <QRCodeSVG value={upiLink(order.payAmount, `SprintDeck ${tier.name}`)} size={176} marginSize={2} />
                </div>
                <p className={`pay-timer ${timerClass}`}>
                  Waiting for payment · <strong>{mmss}</strong>
                </p>
                {renderPayAmount(order.payAmount)}
                <p className="auth-hint pay-hint">Once your payment lands, this confirms automatically.</p>
              </>
            ) : payState === 'pending' ? (
              <p className="linear-notice">Payments aren&rsquo;t configured yet (set VITE_UPI_ID / the upiId secret).</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

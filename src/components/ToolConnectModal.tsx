import { useState } from 'react';
import { toolMeta, type ToolId } from './ConnectToolModal';
import { BackIcon, CloseIcon } from './icons';

interface Props {
  tool: ToolId;
  onBack: () => void;
  onClose: () => void;
  onConnected: (tool: ToolId, key: string) => void;
}

/**
 * Per-tool API-key connect. The user pastes a read/write key/token; we use it to
 * pull estimation tickets and to write agreed story points back after planning.
 *
 * MOCK for now: the key isn't sent anywhere yet — connecting loads sample tickets.
 * Once the provider adapter (roadmap T1/T10) lands, the key goes to the server
 * (encrypted) and drives the real read/write calls.
 */
export default function ToolConnectModal({ tool, onBack, onClose, onConnected }: Props) {
  const meta = toolMeta[tool];
  const [key, setKey] = useState('');
  const [shake, setShake] = useState(false);

  // Outside-click must NOT close — shake the card and flash the ✕.
  function refuseOutsideClose() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  return (
    <div className="modal-overlay" onClick={refuseOutsideClose}>
      <div className={`auth-modal${shake ? ' shake' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="auth-back" onClick={onBack} aria-label="Back" title="Back to tools">
          <BackIcon />
        </button>
        <button
          className={`auth-close${shake ? ' attn' : ''}`}
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <CloseIcon />
        </button>

        <div className="auth-brand">
          {meta.logo} {meta.name}
        </div>
        <h3>Connect {meta.name}</h3>
        <p className="auth-sub">
          Paste an API key with <strong>read &amp; write</strong> access — used to pull your
          estimation tickets and write the agreed story points back.
        </p>

        <input
          className="auth-key"
          type="password"
          placeholder={meta.keyPlaceholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        <p className="auth-hint">{meta.keyHelp}</p>

        <button className="primary auth-wide" disabled={!key.trim()} onClick={() => onConnected(tool, key.trim())}>
          Connect {meta.name}
        </button>
        <button className="ghost auth-wide" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

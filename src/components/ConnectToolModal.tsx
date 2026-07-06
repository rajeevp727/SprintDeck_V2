import type { ReactNode } from 'react';
import LinearLogo from './LinearLogo';

export type ToolId = 'linear' | 'jira' | 'ado';

// Shared metadata for each tool — reused by the picker and the key-entry modal.
export const TOOL_META: Record<
  ToolId,
  { name: string; logo: ReactNode; status: 'ready' | 'preview'; keyPlaceholder: string; keyHelp: string }
> = {
  linear: {
    name: 'Linear',
    logo: <LinearLogo className="tool-logo" />,
    status: 'ready',
    keyPlaceholder: 'lin_api_…',
    keyHelp: 'Linear → Settings → API → Personal API keys (needs write scope).',
  },
  jira: {
    name: 'Jira',
    logo: <span className="tool-tile" style={{ background: '#2684FF' }}>J</span>,
    status: 'preview',
    keyPlaceholder: 'Jira API token',
    keyHelp: 'id.atlassian.com → Security → Create API token.',
  },
  ado: {
    name: 'Azure DevOps',
    logo: <span className="tool-tile" style={{ background: '#0078D7' }}>AZ</span>,
    status: 'preview',
    keyPlaceholder: 'Azure DevOps PAT',
    keyHelp: 'Azure DevOps → User settings → Personal access tokens (Work Items: read & write).',
  },
};

const ORDER: ToolId[] = ['linear', 'jira', 'ado'];

interface Props {
  onClose: () => void;
  onSelect: (tool: ToolId) => void;
}

export default function ConnectToolModal({ onClose, onSelect }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tool-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close" title="Close">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h3>Connect a tool</h3>
        <p className="auth-sub">Pick the tracker to pull estimation tickets from.</p>
        <div className="tool-list">
          {ORDER.map((id) => {
            const t = TOOL_META[id];
            return (
              <button
                key={id}
                className="tool-card"
                onClick={() => onSelect(id)}
                title={`Connect ${t.name}`}
              >
                <span className="tool-logo-wrap">{t.logo}</span>
                <span className="tool-name">{t.name}</span>
                <span className={`tool-status ${t.status}`}>
                  {t.status === 'ready' ? 'Available' : 'Preview'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

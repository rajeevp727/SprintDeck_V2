interface Props {
  onClose: () => void;
}

interface Entry {
  name: string;
  kind: string;
  purpose: string;
  retention: string;
}

/** Essential storage runs without consent; it is what makes the service work at all. */
const essential: Entry[] = [
  {
    name: 'sprintdeck.token',
    kind: 'Local storage',
    purpose: 'Keeps you signed in so every action does not ask for your password',
    retention: '1 day, or 28 days with "Remember me"',
  },
  {
    name: 'sprintdeck.identity.*',
    kind: 'Local storage',
    purpose: 'Remembers who you are inside a room, so a refresh does not make you a new participant',
    retention: 'Until the room ends or you clear your browser',
  },
  {
    name: 'sprintdeck.room',
    kind: 'Local storage',
    purpose: 'Returns you to the room you were in',
    retention: 'Until you leave the room',
  },
  {
    name: 'sprintdeck.view',
    kind: 'Local storage',
    purpose: 'Remembers whether you prefer cards or a list',
    retention: 'Until you clear your browser',
  },
  {
    name: 'sprintdeck.subscription',
    kind: 'Local storage',
    purpose: 'Points at your most recent order while a payment is being confirmed',
    retention: 'Until the order is settled',
  },
  {
    name: 'sprintdeck.cookieConsent',
    kind: 'Local storage',
    purpose: 'Remembers this choice, so you are not asked on every visit',
    retention: 'Until you clear your browser',
  },
];

/** Set only after you accept. */
const optional: Entry[] = [
  {
    name: 'Google AdSense cookies',
    kind: 'Third-party cookies',
    purpose: 'Chooses and measures the adverts shown on free pages',
    retention: 'Set by Google — see their policy',
  },
];

function Table({ rows }: { rows: Entry[] }) {
  return (
    <table className="cookie-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>What it does</th>
          <th>Kept for</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>{row.kind}</td>
            <td>{row.purpose}</td>
            <td>{row.retention}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CookieDetails({ onClose }: Props) {
  return (
    <div className="cookie-details" role="dialog" aria-modal="true" aria-label="What we store">
      <div className="cookie-details-inner">
        <header className="cookie-details-head">
          <h2>What SprintDeck stores</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <p className="auth-hint">
          SprintDeck uses browser storage rather than tracking cookies. Nothing here follows you to
          other sites, and none of it is sold or shared.
        </p>

        <h3>Essential — always on</h3>
        <p className="auth-hint">
          Needed to sign you in and keep you in a room. Without these the service cannot work, so
          they are used without consent under the "strictly necessary" exemption.
        </p>
        <Table rows={essential} />

        <h3>Optional — only if you accept</h3>
        <p className="auth-hint">
          Advertising on free pages. Reject and these are never loaded.
        </p>
        <Table rows={optional} />

        <p className="auth-hint">
          You can change your mind at any time by clearing this site's data in your browser. See the{' '}
          <a href="/privacy">Privacy Policy</a> for your rights of access, correction, export and
          erasure.
        </p>
      </div>
    </div>
  );
}

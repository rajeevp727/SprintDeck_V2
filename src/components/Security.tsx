interface Props {
  onBack: () => void;
}

export default function Security({ onBack }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>Security</h1>
      <p>
        <em>Last updated: 2026-07-06.</em>
      </p>
      <p>How SprintDeck handles data and security, and how to report an issue.</p>

      <h2>Transport &amp; hosting</h2>
      <p>
        All traffic is served over HTTPS/TLS. The app is hosted on Azure Static Web Apps with the API
        on Azure Functions; security response headers (nosniff, frame-deny, HSTS, referrer policy)
        are applied globally.
      </p>

      <h2>Data handling</h2>
      <ul>
        <li>
          <strong>Minimal &amp; ephemeral:</strong> only a display name and the cards voted are held,
          for the lifetime of the room; rooms auto-expire (idle/max TTL) and are deleted.
        </li>
        <li>
          <strong>No accounts:</strong> there is no login or stored personal profile.
        </li>
      </ul>

      <h2>Connected-tool credentials</h2>
      <p>
        Any API key/token you use to connect a project management tool is handled{' '}
        <strong>server-side only</strong> — it is never exposed to other participants or sent to the
        browser. Use a key scoped to the minimum access you need (read to pull tickets, write to push
        estimates).
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        Found a security issue? Please report it responsibly to the site owner via rajeevstech.in and
        allow reasonable time to remediate before any public disclosure. We appreciate good-faith
        research and will not pursue action against it.
      </p>
    </div>
  );
}

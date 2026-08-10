interface Props {
  onBack: () => void;
}

export default function Security({ onBack }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>Security &amp; Compliance</h1>
      <p>
        <em>Last updated: August 2026.</em>
      </p>
      <p>How SprintDeck handles security, network controls, and enterprise compliance.</p>

      <h2>Transport &amp; hosting</h2>
      <p>
        All traffic is served over HTTPS/TLS. The app runs on Azure Static Web Apps with the API on Azure
        Functions. Global security headers are applied on every response:
      </p>
      <ul>
        <li>
          <strong>HSTS</strong> (Strict-Transport-Security) — forces HTTPS for 2 years including subdomains
        </li>
        <li>
          <strong>X-Frame-Options: DENY</strong> and <strong>frame-ancestors &rsquo;none&rsquo;</strong> — clickjacking protection
        </li>
        <li>
          <strong>X-Content-Type-Options: nosniff</strong> — MIME sniffing blocked
        </li>
        <li>
          <strong>Content-Security-Policy</strong> — restricts scripts, frames, and connections to approved origins
        </li>
        <li>
          <strong>Referrer-Policy</strong>, <strong>Permissions-Policy</strong>, <strong>Cross-Origin-Opener-Policy</strong>,
          and <strong>Cross-Origin-Resource-Policy: same-site</strong>
        </li>
        <li>
          <strong>API routes</strong> — <code>Cache-Control: no-store</code> on all <code>/api/*</code> responses
        </li>
      </ul>

      <h2>Firewall &amp; abuse controls</h2>
      <ul>
        <li>
          <strong>Per-IP rate limiting</strong> on authentication, room creation, voting, chat, retro,
          whiteboard, payments, and negotiate endpoints.
        </li>
        <li>
          <strong>Payment ingest</strong> protected by a shared secret (<code>x-ingest-secret</code>) with
          timing-safe comparison.
        </li>
        <li>
          <strong>Web PubSub negotiate</strong> validates session membership before issuing connection tokens.
        </li>
        <li>
          <strong>Azure platform firewall</strong> — configure allowed origins and IP restrictions in the Azure
          portal for production deployments (recommended for enterprise tenants).
        </li>
        <li>
          <strong>No open CORS</strong> — the API is same-origin with the web app; cross-site API calls are
          not permitted by default.
        </li>
      </ul>

      <h2>Authentication &amp; data</h2>
      <ul>
        <li>
          Passwords hashed with <strong>scrypt</strong> and per-user salt; verified with timing-safe compare.
        </li>
        <li>
          Optional accounts use JWT bearer tokens; session rooms use server-issued participant IDs.
        </li>
        <li>
          Ceremony data is ephemeral with automatic TTL; registered accounts can export or delete their data
          (GDPR).
        </li>
        <li>
          Bank-ingest receipts are redacted before storage; client error logs strip email addresses.
        </li>
        <li>
          Security events (login, password change, account deletion, exports) are audit-logged without
          storing passwords.
        </li>
      </ul>

      <h2>GDPR &amp; compliance</h2>
      <ul>
        <li>Cookie consent banner gates non-essential AdSense before any ad scripts load.</li>
        <li>Privacy Policy documents lawful bases, retention, and data-subject rights.</li>
        <li>Account data export (JSON) and permanent deletion available in Account settings.</li>
        <li>Dependabot and CI security scanning (Aikido / npm audit) on every change.</li>
      </ul>

      <h2>Connected-tool credentials</h2>
      <p>
        API keys for project-management tools are handled <strong>server-side only</strong> — never exposed to
        other participants or echoed to the browser.
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        Found a security issue? Report it responsibly to the site owner via rajeevstech.in. Allow reasonable
        time to remediate before public disclosure. Good-faith research is welcome.
      </p>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export default function Terms({ onBack }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>Terms of Service</h1>
      <p>
        <em>Effective: August 2026.</em>
      </p>
      <p>
        By using SprintDeck (the &ldquo;Service&rdquo;) you agree to these terms. If you do not agree, please
        don&rsquo;t use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        SprintDeck provides real-time agile ceremonies: planning poker, retrospectives, shared whiteboards,
        and standup timesheets. Optional paid subscriptions unlock integrations and advanced features.
      </p>

      <h2>2. Accounts &amp; access</h2>
      <p>
        You may use SprintDeck as a guest (display name only) or register an account (email + password).
        Anyone with a room code or invite link can join that ceremony — share links only with intended
        participants. You are responsible for keeping your password confidential.
      </p>

      <h2>3. Subscriptions &amp; payments</h2>
      <p>
        Paid plans are confirmed against server-side payment records. Subscriptions are personal to the
        browser/order reference used at purchase and expire after the stated period. Refunds are at the
        operator&rsquo;s discretion unless required by law.
      </p>

      <h2>4. Connected tools</h2>
      <p>
        If you connect a project-management tool, you provide credentials scoped to the access you need.
        SprintDeck uses them only to read tickets you choose and write estimates you approve. Third-party
        terms still apply.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Don&rsquo;t use the Service unlawfully, attempt to disrupt or overload it, scrape data without
        permission, or upload content you have no right to share.
      </p>

      <h2>6. Privacy &amp; data rights</h2>
      <p>
        Our <a href="/privacy">Privacy Policy</a> describes how we process data and your GDPR rights,
        including access, portability, and erasure. Account holders can exercise these from Account settings.
      </p>

      <h2>7. Availability &amp; changes</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; on a best-effort basis. Ceremony rooms are ephemeral.
        We may change, suspend, or discontinue features at any time.
      </p>

      <h2>8. Disclaimer &amp; liability</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided without warranties and the owner is
        not liable for indirect or consequential damages, including estimates written to connected tools.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>We may update these terms; continued use after an update constitutes acceptance.</p>

      <h2>10. Contact</h2>
      <p>Questions about these terms? Contact the site owner via rajeevstech.in.</p>
    </div>
  );
}

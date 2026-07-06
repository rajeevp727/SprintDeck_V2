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
        <em>Effective: 2026-07-06.</em>
      </p>
      <p>
        By using SprintDeck (the &ldquo;Service&rdquo;) you agree to these terms. If you do not
        agree, please don&rsquo;t use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        SprintDeck is a real-time planning-poker tool for sprint estimation. A moderator creates a
        room, the team votes on stories, and — when connected to a project management tool — agreed
        estimates can be written back to the source tickets.
      </p>

      <h2>2. Accounts &amp; access</h2>
      <p>
        The Service requires no account. Anyone with a room&rsquo;s code or invite link can join, so
        you are responsible for sharing it only with your intended participants.
      </p>

      <h2>3. Connected tools</h2>
      <p>
        If you connect a project management tool (e.g. Linear, Jira, Azure DevOps), you do so with an
        API key/token you provide, and you are responsible for the permissions it grants. Your use of
        those tools remains governed by their own terms. SprintDeck uses the credential only to read
        the tickets you choose and write the estimates you approve.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        Don&rsquo;t use the Service unlawfully, attempt to disrupt or overload it, or upload content
        you have no right to share.
      </p>

      <h2>5. Availability &amp; changes</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, on a
        best-effort footing. Rooms are ephemeral and expire automatically. We may change, suspend, or
        discontinue features at any time.
      </p>

      <h2>6. Disclaimer &amp; liability</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided without warranties of any
        kind, and the owner is not liable for any indirect or consequential damages arising from its
        use, including any estimates written to your connected tools.
      </p>

      <h2>7. Changes to these terms</h2>
      <p>We may update these terms; continued use after an update constitutes acceptance.</p>

      <h2>8. Contact</h2>
      <p>Questions about these terms? Contact the site owner via rajeevstech.in.</p>
    </div>
  );
}

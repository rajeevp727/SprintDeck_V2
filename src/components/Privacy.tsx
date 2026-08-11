interface Props {
  onBack: () => void;
}

export default function Privacy({ onBack }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1 id="privacy">Privacy Policy</h1>
      <p>
        <em>Last updated: August 2026.</em>
      </p>
      <p>
        SprintDeck (&ldquo;we&rdquo;, &ldquo;the Service&rdquo;) is operated by rajeevstech.in. This policy
        explains what we process, why, and your rights under GDPR and similar laws.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>
          <strong>Guest sessions:</strong> display name, votes, chat, and ceremony data for planning poker,
          retrospectives, whiteboards, and standup notes. Session data is ephemeral and auto-deleted after idle
          and maximum TTLs (typically 4–8 hours).
        </li>
        <li>
          <strong>Registered accounts (optional):</strong> email, display name, and a salted password hash
          stored in Azure Cosmos DB. Authentication tokens are kept in your browser&rsquo;s local storage.
        </li>
        <li>
          <strong>Subscriptions:</strong> if you purchase a plan, we store order metadata (tier, amount,
          status, email) and redacted payment-ingest receipts. Subscriptions expire 30 days after confirmation.
        </li>
        <li>
          <strong>Local browser data:</strong> room identity, remembered accounts, cookie-consent choice,
          subscription order reference, and standup timesheet drafts may be stored locally on your device.
        </li>
      </ul>

      <h2>Lawful bases (GDPR Art. 6)</h2>
      <ul>
        <li>
          <strong>Contract / service delivery:</strong> running ceremonies you join or host, including
          real-time sync.
        </li>
        <li>
          <strong>Legitimate interest:</strong> security (rate limiting, abuse prevention), minimal audit
          logs, and service reliability.
        </li>
        <li>
          <strong>Consent:</strong> non-essential Google AdSense cookies and personalised ads — only loaded
          after you accept in the cookie banner.
        </li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Access &amp; portability:</strong> signed-in users can download their data from Account
          settings → &ldquo;Download my data&rdquo;.
        </li>
        <li>
          <strong>Erasure:</strong> delete your account from Account settings; we remove your profile and
          anonymise linked subscription records.
        </li>
        <li>
          <strong>Rectification:</strong> update your display name and password in Account settings.
        </li>
        <li>
          <strong>Withdraw consent:</strong> reject non-essential cookies in the banner; clear site data in
          your browser to remove local storage.
        </li>
        <li>
          <strong>Complaint:</strong> you may lodge a complaint with your local data-protection authority.
        </li>
      </ul>

      <h2>Cookies and advertising</h2>
      <p>
        Essential local storage is required for sessions and accounts. Google AdSense scripts and ad cookies
        load only if you click <strong>Accept</strong> in the cookie banner. You may opt out of personalised
        advertising at{' '}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
          Google Ads Settings
        </a>
        . See{' '}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          Google&rsquo;s partner policies
        </a>
        .
      </p>

      <h2>Retention</h2>
      <ul>
        <li>Live ceremony rooms, retros, and whiteboards: auto-expire (idle + max TTL).</li>
        <li>Accounts: kept until you delete them.</li>
        <li>Payment orders: email anonymised on account deletion; financial metadata retained for audit.</li>
        <li>Cookie consent choice: stored locally until you clear site data.</li>
      </ul>

      <h2>Processors &amp; transfers</h2>
      <p>
        We use Microsoft Azure (hosting, Cosmos DB, Web PubSub) and, with consent, Google (AdSense). Data is
        processed under their respective terms and standard contractual safeguards where applicable.
      </p>

      <h2>Contact</h2>
      <p>For privacy requests, contact the site owner via rajeevstech.in.</p>
    </div>
  );
}

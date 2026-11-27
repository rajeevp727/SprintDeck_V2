import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { organisationApi, type OrganisationDetails, type OrganisationRole, type OrganisationSummary } from '../lib/organisationApi';

const roles: OrganisationRole[] = ['admin', 'team-lead', 'member', 'stakeholder'];

export default function OrganisationWorkspace() {
  const { user } = useAuth();
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState<OrganisationDetails | null>(null);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganisationRole>('member');
  const [inviteToken, setInviteToken] = useState('');
  const [acceptOrgId, setAcceptOrgId] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(() => organisations.find((org) => org.id === selectedId) || null, [organisations, selectedId]);

  async function refresh(preferredId = selectedId) {
    const result = await organisationApi.list();
    setOrganisations(result.organisations);
    const nextId = result.organisations.some((org) => org.id === preferredId) ? preferredId : result.organisations[0]?.id || '';
    setSelectedId(nextId);
    if (nextId) setDetails(await organisationApi.get(nextId));
    else setDetails(null);
  }

  useEffect(() => {
    let active = true;
    organisationApi.list().then(async (result) => {
      if (!active) return;
      setOrganisations(result.organisations);
      const first = result.organisations[0];
      if (first) {
        setSelectedId(first.id);
        const detail = await organisationApi.get(first.id);
        if (active) setDetails(detail);
      }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError((err as Error).message || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  async function createOrganisation(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await organisationApi.create(name);
      setName('');
      await refresh(result.organisation.id);
      setNotice('Organisation created.');
    });
  }

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    await run(async () => {
      await organisationApi.createTeam(selectedId, teamName, timezone);
      setTeamName('');
      await refresh(selectedId);
      setNotice('Team created.');
    });
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    await run(async () => {
      const result = await organisationApi.invite(selectedId, inviteEmail, inviteRole);
      setInviteToken(result.invitation.token);
      setNotice('Invitation created. Copy the one-time token and share it securely with the invited person.');
    });
  }

  async function acceptInvitation(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await organisationApi.accept(acceptOrgId, acceptToken);
      setAcceptToken(''); setAcceptOrgId('');
      await refresh();
      setNotice('Invitation accepted.');
    });
  }

  async function changeRole(userId: string, role: OrganisationRole) {
    if (!selectedId) return;
    await run(async () => {
      await organisationApi.setRole(selectedId, userId, role);
      await refresh(selectedId);
      setNotice('Member role updated.');
    });
  }

  return (
    <section className="workspace-panel" aria-labelledby="workspace-title">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">TEAM FIRST</p>
          <h2 id="workspace-title">Workspaces</h2>
          <p>Organise your teams, invite colleagues and manage access in one place.</p>
        </div>
        <span className="workspace-count">{organisations.length} organisation{organisations.length === 1 ? '' : 's'}</span>
      </div>

      {error && <p className="workspace-alert error" role="alert">{error}</p>}
      {notice && <p className="workspace-alert success" role="status">{notice}</p>}

      <div className="workspace-create-row">
        <form onSubmit={createOrganisation}>
          <label htmlFor="workspace-org-name">Create an organisation</label>
          <div className="workspace-inline">
            <input id="workspace-org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Engineering" minLength={2} maxLength={80} required />
            <button className="primary" disabled={busy}>Create</button>
          </div>
        </form>
        <form onSubmit={acceptInvitation}>
          <label htmlFor="workspace-invite-org">Accept an invitation</label>
          <div className="workspace-inline">
            <input id="workspace-invite-org" value={acceptOrgId} onChange={(e) => setAcceptOrgId(e.target.value)} placeholder="Organisation ID" required />
            <input aria-label="Invitation token" value={acceptToken} onChange={(e) => setAcceptToken(e.target.value)} placeholder="One-time token" required />
            <button className="ghost" disabled={busy}>Join</button>
          </div>
        </form>
      </div>

      {organisations.length > 0 && (
        <>
          <label className="workspace-select-label" htmlFor="workspace-select">Current organisation</label>
          <select id="workspace-select" className="workspace-select" value={selectedId} onChange={(e) => run(async () => { setSelectedId(e.target.value); setDetails(await organisationApi.get(e.target.value)); })}>
            {organisations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          {details && (
            <div className="workspace-grid">
              <div className="workspace-section">
                <h3>Teams</h3>
                {details.teams.length ? <ul className="workspace-list">{details.teams.map((team) => <li key={team.id}><strong>{team.name}</strong><span>{team.timezone}</span></li>)}</ul> : <p className="workspace-empty">No teams yet. Create your first team.</p>}
                {selected && ['owner', 'admin'].includes(details.members.find((m) => m.userId === details.organisation.id)?.role || '') ? null : null}
                <form onSubmit={createTeam} className="workspace-form">
                  <label htmlFor="workspace-team-name">New team</label>
                  <input id="workspace-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Platform team" minLength={2} maxLength={80} required />
                  <label htmlFor="workspace-timezone">Team timezone</label>
                  <input id="workspace-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={80} />
                  <button className="ghost" disabled={busy}>Create team</button>
                </form>
              </div>
              <div className="workspace-section">
                <h3>Members <span>{details.members.length}</span></h3>
                <ul className="workspace-list workspace-members">
                  {details.members.map((member) => (
                    <li key={member.userId}>
                      <div><strong>{member.name || member.email}</strong><small>{member.email}</small></div>
                      {member.role === 'owner' ? <span className="workspace-role">Owner</span> : (
                        <select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy || details.members.find((m) => m.userId === user?.id)?.role !== 'owner'} onChange={(e) => changeRole(member.userId, e.target.value as OrganisationRole)}>
                          {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
                {['owner', 'admin'].includes(details.members.find((m) => m.userId === user?.id)?.role || '') && <form onSubmit={invite} className="workspace-form">
                  <label htmlFor="workspace-invite-email">Invite by email</label>
                  <input id="workspace-invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" required />
                  <label htmlFor="workspace-invite-role">Organisation role</label>
                  <select id="workspace-invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrganisationRole)}>
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <button className="ghost" disabled={busy}>Create invitation</button>
                  {inviteToken && <div className="workspace-token"><small>One-time invitation token</small><code>{inviteToken}</code><button type="button" className="ghost" onClick={() => navigator.clipboard?.writeText(inviteToken)}>Copy token</button></div>}
                </form>
              </div>
            </div>
          )}
        </>
      )}
      {organisations.length === 0 && <p className="workspace-empty">No organisation yet. Create one to start inviting your team.</p>}
    </section>
  );
}

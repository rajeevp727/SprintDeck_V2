import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { organisationApi, saveActiveWorkspace, type OrganisationDetails, type OrganisationRole, type OrganisationSummary, type WorkspaceAnalytics, type ScrumCoachResult } from '../lib/organisationApi';

const roles: OrganisationRole[] = ['admin', 'team-lead', 'member', 'stakeholder'];

export default function OrganisationWorkspace() {
  const { user } = useAuth();
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState<OrganisationDetails | null>(null);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(null);
  const [analyticsTeamId, setAnalyticsTeamId] = useState('');
  const [coach, setCoach] = useState<ScrumCoachResult | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganisationRole>('member');
  const [inviteToken, setInviteToken] = useState('');
  const [teamMemberUser, setTeamMemberUser] = useState('');
  const [teamMemberRole, setTeamMemberRole] = useState<'lead' | 'member' | 'stakeholder'>('member');
  const [goalTeamId, setGoalTeamId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalUnit, setGoalUnit] = useState('');
  const [goalDueDate, setGoalDueDate] = useState('');
  const [acceptOrgId, setAcceptOrgId] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');


  useEffect(() => {
    if (!selectedId) { setAnalytics(null); return; }
    let active = true;
    organisationApi.analytics(selectedId, analyticsTeamId || undefined)
      .then((result) => { if (active) setAnalytics(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [selectedId, analyticsTeamId]);

  async function generateCoachInsights() {
    if (!selectedId) return;
    setCoachBusy(true); setError('');
    try { setCoach(await organisationApi.scrumCoach(selectedId, analyticsTeamId || undefined)); }
    catch (err) { setError((err as Error).message); }
    finally { setCoachBusy(false); }
  }

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

  async function assignTeamMember(teamId: string) {
    if (!selectedId || !teamMemberUser) return;
    await run(async () => {
      await organisationApi.setTeamMember(selectedId, teamId, teamMemberUser, teamMemberRole);
      await refresh(selectedId);
      setNotice('Team membership updated.');
    });
  }

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !goalTeamId) return;
    await run(async () => {
      await organisationApi.createGoal(selectedId, goalTeamId, { title: goalTitle, target: Number(goalTarget), current: 0, unit: goalUnit, dueDate: goalDueDate || undefined });
      setGoalTitle(''); setGoalTarget(''); setGoalUnit(''); setGoalDueDate('');
      await refresh(selectedId);
      setNotice('Team goal created.');
    });
  }

  async function incrementGoal(teamId: string, goalId: string, current: number) {
    if (!selectedId) return;
    await run(async () => {
      await organisationApi.updateGoal(selectedId, teamId, goalId, { current: current + 1 });
      await refresh(selectedId);
      setNotice('Goal progress updated.');
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
            <div className="workspace-analytics">
              <div className="workspace-analytics-head">
                <div><h3>Sprint health</h3><p>Retrospective follow-through and team learning</p></div>
                <select aria-label="Analytics scope" value={analyticsTeamId} onChange={(e) => setAnalyticsTeamId(e.target.value)}>
                  <option value="">All teams</option>
                  {details.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              {analytics ? (
                <>
                  <div className="workspace-metrics">
                    <div><strong>{analytics.retrospectiveCount}</strong><span>Retrospectives</span></div>
                    <div><strong>{analytics.actionCount}</strong><span>Actions tracked</span></div>
                    <div><strong>{analytics.completedActions}</strong><span>Completed</span></div>
                    <div><strong>{analytics.overdueActions}</strong><span>Overdue</span></div>
                    <div><strong>{analytics.completionRate == null ? '—' : `${analytics.completionRate}%`}</strong><span>Completion rate</span></div>
                  </div>
                  {analytics.sprints.length > 0 ? <ul className="workspace-sprint-list">{analytics.sprints.slice(0, 6).map((sprint) => <li key={sprint.id}><div><strong>{sprint.name}</strong><small>{new Date(sprint.endedAt).toLocaleDateString()} · {sprint.participantCount} participants · {sprint.noteCount} notes</small></div><span>{sprint.completionRate == null ? 'No actions' : `${sprint.completionRate}% actions done`}</span></li>)}</ul> : <p className="workspace-empty">End a retrospective while this team is selected to start building its sprint history.</p>}
                  <p className="workspace-analytics-caveat">{analytics.caveat}</p>
                  <div className="workspace-coach">
                    <div><strong>Scrum Coach</strong><small>Read-only team improvement guidance</small></div>
                    <button type="button" className="ghost" disabled={coachBusy} onClick={generateCoachInsights}>{coachBusy ? 'Thinking…' : 'Generate insights'}</button>
                    {coach && (
                      <div className="workspace-coach-result">
                        {coach.summary && <p>{coach.summary}</p>}
                        {coach.suggestions.map((suggestion, index) => <p key={index}>• {suggestion}</p>)}
                        {coach.message && <small>{coach.message}</small>}
                        {!coach.configured && <small>Configure AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT to enable generated AI guidance.</small>}
                      </div>
                    )}
                  </div>
                </>
              ) : <p className="workspace-empty">Loading sprint health…</p>}
            </div>
          )}
          {details && (
            <div className="workspace-grid">
              <div className="workspace-section">
                <h3>Teams</h3>
                {details.teams.length ? <ul className="workspace-list">{details.teams.map((team) => (
                  <li key={team.id} className="workspace-team-item">
                    <div><strong>{team.name}</strong><small>{team.timezone} · {(team.members || []).length} team member(s)</small><button type="button" className="ghost workspace-activate" onClick={() => { saveActiveWorkspace({ organisationId: selectedId, teamId: team.id }); setNotice(`${details.organisation.name} / ${team.name} is now the active ceremony workspace.`); }}>Use for ceremonies</button></div>
                    {['owner', 'admin'].includes(details.members.find((m) => m.userId === user?.id)?.role || '') || (team.members || []).some((m) => m.userId === user?.id && m.role === 'lead') ? (
                      <div className="workspace-team-assign">
                        <select aria-label={`Member to add to ${team.name}`} value={teamMemberUser} onChange={(e) => setTeamMemberUser(e.target.value)}>
                          <option value="">Select org member</option>
                          {details.members.filter((member) => !(team.members || []).some((existing) => existing.userId === member.userId)).map((member) => <option key={member.userId} value={member.userId}>{member.name || member.email}</option>)}
                        </select>
                        <select aria-label="Team role" value={teamMemberRole} onChange={(e) => setTeamMemberRole(e.target.value as 'lead' | 'member' | 'stakeholder')}>
                          <option value="member">Member</option><option value="lead">Lead</option><option value="stakeholder">Stakeholder</option>
                        </select>
                        <button type="button" className="ghost" disabled={busy || !teamMemberUser} onClick={() => assignTeamMember(team.id)}>Add</button>
                      </div>
                    ) : null}
                  </li>
                ))}</ul> : <p className="workspace-empty">No teams yet. Create your first team.</p>}
                {details.teams.some((team) => (team.goals || []).length > 0) && (
                  <div className="workspace-goals">
                    <h4>Team goals & OKRs</h4>
                    {details.teams.map((team) => (team.goals || []).map((goal) => (
                      <div className="workspace-goal" key={goal.id}>
                        <div><strong>{goal.title}</strong><small>{goal.current} / {goal.target} {goal.unit || ''} · {goal.status}{goal.dueDate ? ` · due ${goal.dueDate}` : ''}</small></div>
                        <div className="workspace-goal-progress"><span style={{ width: `${Math.min(100, Math.round((goal.current / goal.target) * 100))}%` }} /></div>
                        {['owner', 'admin'].includes(details.members.find((m) => m.userId === user?.id)?.role || '') || (team.members || []).some((member) => member.userId === user?.id && member.role === 'lead') ? <button type="button" className="ghost" disabled={busy || goal.status === 'completed'} onClick={() => incrementGoal(team.id, goal.id, goal.current)}>Update progress +1</button> : null}
                      </div>
                    )))}
                  </div>
                )}
                {['owner', 'admin'].includes(details.members.find((m) => m.userId === user?.id)?.role || '') && <form onSubmit={createGoal} className="workspace-form">
                  <h4>Create a team goal</h4>
                  <label htmlFor="workspace-goal-team">Team</label>
                  <select id="workspace-goal-team" value={goalTeamId} onChange={(e) => setGoalTeamId(e.target.value)} required>
                    <option value="">Select team</option>{details.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <label htmlFor="workspace-goal-title">Goal</label>
                  <input id="workspace-goal-title" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="e.g. Reduce escaped defects" minLength={3} maxLength={120} required />
                  <div className="workspace-inline">
                    <label>Target<input type="number" min="1" step="any" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} required /></label>
                    <label>Unit<input value={goalUnit} onChange={(e) => setGoalUnit(e.target.value)} placeholder="e.g. defects" maxLength={30} /></label>
                  </div>
                  <label htmlFor="workspace-goal-date">Due date</label>
                  <input id="workspace-goal-date" type="date" value={goalDueDate} onChange={(e) => setGoalDueDate(e.target.value)} />
                  <button className="ghost" disabled={busy || !details.teams.length}>Create goal</button>
                </form>}
                {['owner', 'admin'].includes(details.members.find((m) => m.userId === user?.id)?.role || '') && <form onSubmit={createTeam} className="workspace-form">
                  <label htmlFor="workspace-team-name">New team</label>
                  <input id="workspace-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Platform team" minLength={2} maxLength={80} required />
                  <label htmlFor="workspace-timezone">Team timezone</label>
                  <input id="workspace-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={80} />
                  <button className="ghost" disabled={busy}>Create team</button>
                </form>}
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
                </form>}
              </div>
            </div>
          )}
        </>
      )}
      {organisations.length === 0 && <p className="workspace-empty">No organisation yet. Create one to start inviting your team.</p>}
    </section>
  );
}

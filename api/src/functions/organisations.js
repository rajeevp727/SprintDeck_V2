'use strict';

const { app } = require('@azure/functions');
const store = require('../organisation-store');
const entitlement = require('../entitlement');
const users = require('../users-store');

const noCache = { 'Cache-Control': 'no-store' };
const ok = (body) => ({ status: 200, jsonBody: body, headers: noCache });
const bad = (message, status = 400) => ({ status, jsonBody: { error: message }, headers: noCache });

async function caller(req) {
  const plan = await entitlement.planForRequest(req);
  if (!plan.accountId) return { error: bad('Please sign in again', 401) };
  const user = await users.getById(plan.accountId);
  if (!user) return { error: bad('Please sign in again', 401) };
  return { user };
}

async function body(req) {
  try { return (await req.json()) || {}; } catch { return {}; }
}

app.http('listOrganisations', {
  methods: ['GET'], authLevel: 'anonymous', route: 'organisations',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    return ok({ organisations: await store.listForUser(user.id) });
  },
});

app.http('createOrganisation', {
  methods: ['POST'], authLevel: 'anonymous', route: 'organisations',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const result = await store.create(user, (await body(req)).name);
    return result.error ? bad(result.error) : ok(result);
  },
});

app.http('getOrganisation', {
  methods: ['GET'], authLevel: 'anonymous', route: 'organisations/{orgId}',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const result = await store.getForUser(user.id, req.params.orgId);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});

app.http('createOrganisationTeam', {
  methods: ['POST'], authLevel: 'anonymous', route: 'organisations/{orgId}/teams',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const data = await body(req);
    const result = await store.createTeam(user.id, req.params.orgId, data.name, data.timezone);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});

app.http('inviteOrganisationMember', {
  methods: ['POST'], authLevel: 'anonymous', route: 'organisations/{orgId}/invitations',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const data = await body(req);
    const result = await store.invite(user.id, req.params.orgId, data.email, data.role);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});

app.http('acceptOrganisationInvitation', {
  methods: ['POST'], authLevel: 'anonymous', route: 'organisations/{orgId}/invitations/accept',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const result = await store.acceptInvite(user, req.params.orgId, (await body(req)).token);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});

app.http('updateOrganisationMemberRole', {
  methods: ['PATCH'], authLevel: 'anonymous', route: 'organisations/{orgId}/members/{userId}',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const result = await store.setMemberRole(user.id, req.params.orgId, req.params.userId, (await body(req)).role);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});


app.http('updateOrganisationTeamMember', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'organisations/{orgId}/teams/{teamId}/members/{userId}',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const result = await store.setTeamMember(user.id, req.params.orgId, req.params.teamId, req.params.userId, (await body(req)).role);
    return result.error ? bad(result.error, result.status) : ok(result);
  },
});


app.http('organisationAnalytics', {
  methods: ['GET'], authLevel: 'anonymous', route: 'organisations/{orgId}/analytics',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const details = await store.getForUser(user.id, req.params.orgId);
    if (details.error) return bad(details.error, details.status);
    const teamId = req.query.get('teamId') || '';
    if (teamId && !details.teams.some((team) => team.id === teamId)) return bad('Team not found', 404);
    const archives = await require('../retroStore').listOrganisationArchives(req.params.orgId, teamId || undefined);
    const actions = archives.flatMap((archive) => archive.actionItems || []);
    const completed = actions.filter((item) => item.status === 'done' || item.done).length;
    const now = Date.now();
    const overdue = actions.filter((item) => item.status !== 'done' && !item.done && item.dueDate && Date.parse(item.dueDate + 'T23:59:59Z') < now).length;
    const bySprint = archives.map((archive) => {
      const sprintActions = archive.actionItems || [];
      const done = sprintActions.filter((item) => item.status === 'done' || item.done).length;
      return {
        id: archive.id,
        name: archive.name,
        endedAt: archive.endedAt,
        participantCount: (archive.participants || []).length,
        noteCount: (archive.notes || []).length,
        actionCount: sprintActions.length,
        completedActions: done,
        completionRate: sprintActions.length ? Math.round((done / sprintActions.length) * 100) : null,
      };
    });
    return ok({
      scope: teamId ? 'team' : 'organisation',
      retrospectiveCount: archives.length,
      participantCount: archives.reduce((sum, archive) => sum + (archive.participants || []).length, 0),
      noteCount: archives.reduce((sum, archive) => sum + (archive.notes || []).length, 0),
      actionCount: actions.length,
      completedActions: completed,
      openActions: actions.length - completed,
      overdueActions: overdue,
      completionRate: actions.length ? Math.round((completed / actions.length) * 100) : null,
      sprints: bySprint,
      caveat: 'Metrics include only retrospectives created after a team was selected as the active workspace. They are team-level workflow signals, not individual performance scores.',
    });
  },
});


app.http('scrumCoachInsights', {
  methods: ['POST'], authLevel: 'anonymous', route: 'organisations/{orgId}/scrum-coach',
  handler: async (req) => {
    const { user, error } = await caller(req);
    if (error) return error;
    const details = await store.getForUser(user.id, req.params.orgId);
    if (details.error) return bad(details.error, details.status);
    const data = await body(req);
    const teamId = String(data.teamId || '');
    if (teamId && !details.teams.some((team) => team.id === teamId)) return bad('Team not found', 404);
    const archives = await require('../retroStore').listOrganisationArchives(req.params.orgId, teamId || undefined);
    const actions = archives.flatMap((archive) => archive.actionItems || []);
    const completed = actions.filter((item) => item.status === 'done' || item.done).length;
    const overdue = actions.filter((item) => item.status !== 'done' && !item.done && item.dueDate && Date.parse(item.dueDate + 'T23:59:59Z') < Date.now()).length;
    const metrics = {
      retrospectives: archives.length,
      actionItems: actions.length,
      completedActions: completed,
      openActions: actions.length - completed,
      overdueActions: overdue,
      completionRate: actions.length ? Math.round((completed / actions.length) * 100) : null,
      sprints: archives.slice(0, 6).map((archive) => ({
        name: archive.name,
        participantCount: (archive.participants || []).length,
        noteCount: (archive.notes || []).length,
        actionCount: (archive.actionItems || []).length,
      })),
    };
    let endpoint = String(process.env.AZURE_OPENAI_ENDPOINT || '');
    while (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
    const key = process.env.AZURE_OPENAI_API_KEY || '';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || '';
    if (!endpoint || !key || !deployment) {
      const suggestions = [];
      if (!metrics.retrospectives) suggestions.push('Run and finish your first retrospective with this team to establish a baseline.');
      if (metrics.overdueActions) suggestions.push(`Review the ${metrics.overdueActions} overdue action(s), identify blockers and agree on a realistic next step.`);
      if (metrics.completionRate !== null && metrics.completionRate < 60) suggestions.push('Keep the next retrospective action list smaller and make each commitment specific, owned and time-bound.');
      if (metrics.openActions > 0 && metrics.completionRate !== null && metrics.completionRate >= 60) suggestions.push('Review remaining open actions at the start of the next retrospective and explicitly close or re-scope stale work.');
      if (metrics.retrospectives > 0 && !metrics.actionItems) suggestions.push('Turn one high-impact discussion theme into a measurable action with an owner and due date.');
      return ok({ configured: false, readOnly: true, metrics, suggestions, message: 'Azure OpenAI is not configured. These are rule-based prompts, not generated AI advice.' });
    }
    try {
      const version = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
      const response = await fetch(`${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(version)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': key },
        body: JSON.stringify({
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are SprintDeck Scrum Coach. Provide concise, practical, non-judgmental team-level improvement suggestions. This is read-only: never claim to have changed records. Never rank or score individuals, infer personal productivity, or use story points as an individual performance metric. Return JSON with a suggestions array of 3 to 5 short strings and a one-sentence summary.' },
            { role: 'user', content: JSON.stringify(metrics) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Azure OpenAI returned ${response.status}`);
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((item) => String(item).slice(0, 500)).slice(0, 5) : [];
      return ok({ configured: true, readOnly: true, metrics, summary: String(parsed.summary || '').slice(0, 500), suggestions });
    } catch (err) {
      console.error('[scrum-coach] insight generation failed', err);
      return bad('Scrum Coach could not generate insights right now', 502);
    }
  },
});

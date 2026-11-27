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

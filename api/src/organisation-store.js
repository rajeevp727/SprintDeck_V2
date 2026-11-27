'use strict';

const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');

const connection = process.env.COSMOS_CONNECTION_STRING || '';
const databaseName = process.env.COSMOS_DB_NAME || 'sprintdeck';
const containerName = 'organisations';
const memory = new Map();
let containerPromise;

function container() {
  if (!connection) return null;
  if (!containerPromise) {
    const client = new CosmosClient(connection);
    containerPromise = (async () => {
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: databaseName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: databaseName }));
      }
      const result = await database.containers.createIfNotExists({
        id: containerName,
        partitionKey: { paths: ['/id'] },
      });
      return result.container;
    })().catch((error) => {
      containerPromise = null;
      throw error;
    });
  }
  return containerPromise;
}

const clean = (value, max = 100) => String(value || '').trim().replace(/\\s+/g, ' ').slice(0, max);
const email = (value) => String(value || '').trim().toLowerCase();
const slugify = (value) => clean(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const id = () => crypto.randomUUID();
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function read(orgId) {
  const c = container();
  if (!c) return memory.get(orgId) || null;
  try {
    const { resource } = await (await c).item(orgId, orgId).read();
    return resource || null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

async function write(org) {
  org.updatedAt = Date.now();
  const c = container();
  if (!c) memory.set(org.id, org);
  else await (await c).items.upsert(org);
  return org;
}

function memberOf(org, userId) {
  return (org.members || []).find((member) => member.userId === userId && member.status === 'active') || null;
}

function audit(org, actorId, action, targetType, targetId) {
  org.audit = Array.isArray(org.audit) ? org.audit : [];
  org.audit.push({ id: id(), actorId, action, targetType, targetId, at: Date.now() });
  if (org.audit.length > 500) org.audit = org.audit.slice(-500);
}

async function listForUser(userId) {
  const c = container();
  if (!c) return [...memory.values()].filter((org) => !!memberOf(org, userId)).map(summary);
  const { resources } = await (await c).items.query({
    query: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.members, { userId: @userId, status: 'active' }, true)",
    parameters: [{ name: '@userId', value: userId }],
  }).fetchAll();
  return resources.map(summary);
}

function summary(org) {
  const { audit: _audit, invitations: _invitations, ...safe } = org;
  return { ...safe, memberCount: (org.members || []).filter((m) => m.status === 'active').length };
}

async function create(user, name) {
  const orgName = clean(name, 80);
  if (orgName.length < 2) return { error: 'Enter an organisation name with at least 2 characters' };
  const now = Date.now();
  const org = {
    id: id(),
    name: orgName,
    slug: slugify(orgName) + '-' + crypto.randomBytes(3).toString('hex'),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    members: [{ userId: user.id, email: email(user.email), name: clean(user.name, 80), role: 'owner', status: 'active', joinedAt: now }],
    teams: [],
    invitations: [],
    audit: [],
  };
  audit(org, user.id, 'organisation.created', 'organisation', org.id);
  const c = container();
  if (!c) memory.set(org.id, org);
  else await (await c).items.create(org);
  return { organisation: summary(org) };
}

async function createTeam(userId, orgId, name, timezone) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const member = memberOf(org, userId);
  if (!member || !['owner', 'admin'].includes(member.role)) return { error: 'Only organisation owners and admins can create teams', status: 403 };
  const teamName = clean(name, 80);
  if (teamName.length < 2) return { error: 'Enter a team name', status: 400 };
  if (org.teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase() && !team.archivedAt)) return { error: 'A team with that name already exists', status: 409 };
  const team = { id: id(), name: teamName, timezone: clean(timezone, 80) || 'UTC', createdAt: Date.now(), createdBy: userId, archivedAt: null, members: [{ userId, role: 'lead', joinedAt: Date.now() }] };
  org.teams.push(team);
  audit(org, userId, 'team.created', 'team', team.id);
  await write(org);
  return { team };
}

async function setTeamMember(actorId, orgId, teamId, targetUserId, role) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const actor = memberOf(org, actorId);
  if (!actor) return { error: 'You are not a member of this organisation', status: 403 };
  const team = org.teams.find((item) => item.id === teamId && !item.archivedAt);
  if (!team) return { error: 'Team not found', status: 404 };
  const currentTeamRole = (team.members || []).find((item) => item.userId === actorId)?.role;
  if (!['owner', 'admin'].includes(actor.role) && currentTeamRole !== 'lead') return { error: 'Only organisation admins or this team’s lead can manage team membership', status: 403 };
  if (!memberOf(org, targetUserId)) return { error: 'The person must join the organisation before being added to a team', status: 400 };
  if (!['lead', 'member', 'stakeholder'].includes(role)) return { error: 'Invalid team role', status: 400 };
  const target = (team.members || []).find((item) => item.userId === targetUserId);
  if (target) target.role = role;
  else team.members.push({ userId: targetUserId, role, joinedAt: Date.now() });
  audit(org, actorId, 'team.member_assigned', 'team', teamId);
  await write(org);
  return { team };
}

async function addTeamGoal(actorId, orgId, teamId, input = {}) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const actor = memberOf(org, actorId);
  const team = org.teams.find((item) => item.id === teamId && !item.archivedAt);
  if (!actor || !team) return { error: 'Team not found or access denied', status: 404 };
  const teamRole = (team.members || []).find((item) => item.userId === actorId)?.role;
  if (!['owner', 'admin'].includes(actor.role) && teamRole !== 'lead') return { error: 'Only a team lead or organisation admin can manage goals', status: 403 };
  const title = clean(input.title, 120);
  const target = Number(input.target);
  const current = Number(input.current || 0);
  if (title.length < 3) return { error: 'Goal title must be at least 3 characters', status: 400 };
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0) return { error: 'Enter a valid target and current value', status: 400 };
  const goal = { id: id(), title, description: clean(input.description, 500), target, current, unit: clean(input.unit, 30), dueDate: input.dueDate ? String(input.dueDate) : null, status: current >= target ? 'completed' : 'active', createdBy: actorId, createdAt: Date.now(), updatedAt: Date.now() };
  if (goal.dueDate) { const parts = goal.dueDate.split('-').map(Number); if (goal.dueDate.length !== 10 || parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return { error: 'Enter a valid due date', status: 400 }; const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== goal.dueDate) return { error: 'Enter a valid due date', status: 400 }; }
  team.goals = Array.isArray(team.goals) ? team.goals : [];
  if (team.goals.length >= 50) return { error: 'This team has reached its goal limit', status: 409 };
  team.goals.push(goal);
  audit(org, actorId, 'team.goal_created', 'goal', goal.id);
  await write(org);
  return { goal };
}

async function updateTeamGoal(actorId, orgId, teamId, goalId, patch = {}) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const actor = memberOf(org, actorId);
  const team = org.teams.find((item) => item.id === teamId && !item.archivedAt);
  if (!actor || !team) return { error: 'Team not found or access denied', status: 404 };
  const teamRole = (team.members || []).find((item) => item.userId === actorId)?.role;
  if (!['owner', 'admin'].includes(actor.role) && teamRole !== 'lead') return { error: 'Only a team lead or organisation admin can update goals', status: 403 };
  const goal = (team.goals || []).find((item) => item.id === goalId);
  if (!goal) return { error: 'Goal not found', status: 404 };
  if (Object.prototype.hasOwnProperty.call(patch, 'current')) {
    const current = Number(patch.current);
    if (!Number.isFinite(current) || current < 0) return { error: 'Current progress must be zero or more', status: 400 };
    goal.current = current;
    goal.status = current >= goal.target ? 'completed' : 'active';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    if (!['active', 'at-risk', 'completed'].includes(patch.status)) return { error: 'Invalid goal status', status: 400 };
    goal.status = patch.status;
  }
  goal.updatedAt = Date.now();
  audit(org, actorId, 'team.goal_updated', 'goal', goal.id);
  await write(org);
  return { goal };
}

async function invite(userId, orgId, inviteEmail, role) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const actor = memberOf(org, userId);
  if (!actor || !['owner', 'admin'].includes(actor.role)) return { error: 'Only organisation owners and admins can invite members', status: 403 };
  const targetEmail = email(inviteEmail);
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(targetEmail)) return { error: 'Enter a valid email address', status: 400 };
  if (org.members.some((member) => member.email === targetEmail && member.status === 'active')) return { error: 'This person is already a member', status: 409 };
  if (!['admin', 'team-lead', 'member', 'stakeholder'].includes(role)) return { error: 'Invalid organisation role', status: 400 };
  if (actor.role !== 'owner' && role === 'admin') return { error: 'Only the owner can invite an organisation admin', status: 403 };
  const token = crypto.randomBytes(32).toString('hex');
  const invitation = { id: id(), email: targetEmail, role, tokenHash: hash(token), invitedBy: userId, createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, acceptedAt: null };
  org.invitations = (org.invitations || []).filter((item) => item.email !== targetEmail || item.acceptedAt || item.expiresAt < Date.now());
  org.invitations.push(invitation);
  audit(org, userId, 'member.invited', 'invitation', invitation.id);
  await write(org);
  return { invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, token } };
}

async function acceptInvite(user, orgId, token) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const tokenHash = hash(token);
  const invitation = (org.invitations || []).find((item) => item.tokenHash === tokenHash);
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < Date.now()) return { error: 'Invitation is invalid or expired', status: 410 };
  if (invitation.email !== email(user.email)) return { error: 'Sign in with the email address the invitation was sent to', status: 403 };
  const existing = org.members.find((member) => member.email === invitation.email);
  if (existing) Object.assign(existing, { userId: user.id, role: invitation.role, status: 'active', joinedAt: Date.now() });
  else org.members.push({ userId: user.id, email: email(user.email), name: clean(user.name, 80), role: invitation.role, status: 'active', joinedAt: Date.now() });
  invitation.acceptedAt = Date.now();
  invitation.tokenHash = null;
  audit(org, user.id, 'invitation.accepted', 'invitation', invitation.id);
  await write(org);
  return { organisation: summary(org) };
}

async function setMemberRole(actorId, orgId, targetUserId, role) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  const actor = memberOf(org, actorId);
  if (!actor || actor.role !== 'owner') return { error: 'Only the organisation owner can change organisation roles', status: 403 };
  if (!['admin', 'team-lead', 'member', 'stakeholder'].includes(role)) return { error: 'Invalid organisation role', status: 400 };
  const target = memberOf(org, targetUserId);
  if (!target) return { error: 'Member not found', status: 404 };
  if (target.role === 'owner') return { error: 'The owner role cannot be changed here', status: 409 };
  target.role = role;
  audit(org, actorId, 'member.role_changed', 'member', targetUserId);
  await write(org);
  return { member: { userId: target.userId, email: target.email, name: target.name, role: target.role, status: target.status } };
}

async function getForUser(userId, orgId) {
  const org = await read(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 };
  if (!memberOf(org, userId)) return { error: 'You are not a member of this organisation', status: 403 };
  return { organisation: summary(org), members: org.members.filter((m) => m.status === 'active').map(({ userId: memberId, email: memberEmail, name, role, status, joinedAt }) => ({ userId: memberId, email: memberEmail, name, role, status, joinedAt })), teams: org.teams.filter((team) => !team.archivedAt) };
}

module.exports = { listForUser, create, getForUser, createTeam, invite, acceptInvite, setMemberRole, setTeamMember, addTeamGoal, updateTeamGoal, memberOf };

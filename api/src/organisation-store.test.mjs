import { describe, expect, it } from 'vitest';
import organisations from './organisation-store.js';

describe('organisation workspace lifecycle', () => {
  const user = (id, email, name) => ({ id, email, name });

  it('creates an owner workspace, teams and membership invitations', async () => {
    const owner = user(`owner-${Date.now()}`, `owner-${Date.now()}@example.com`, 'Owner');
    const teammate = user(`member-${Date.now()}`, `member-${Date.now()}@example.com`, 'Teammate');
    const created = await organisations.create(owner, 'Platform Engineering');
    expect(created.organisation.name).toBe('Platform Engineering');

    const team = await organisations.createTeam(owner.id, created.organisation.id, 'Platform');
    expect(team.team.name).toBe('Platform');

    const invite = await organisations.invite(owner.id, created.organisation.id, teammate.email, 'member');
    expect(invite.invitation.token).toBeTruthy();
    expect(invite.invitation.tokenHash).toBeUndefined();

    const accepted = await organisations.acceptInvite(teammate, created.organisation.id, invite.invitation.token);
    expect(accepted.organisation.memberCount).toBe(2);

    const assigned = await organisations.setTeamMember(owner.id, created.organisation.id, team.team.id, teammate.id, 'member');
    expect(assigned.team.members.some((member) => member.userId === teammate.id)).toBe(true);

    const details = await organisations.getForUser(teammate.id, created.organisation.id);
    expect(details.members).toHaveLength(2);
    expect(details.teams).toHaveLength(1);
  });

  it('rejects non-members, wrong invitation emails and privilege escalation', async () => {
    const owner = user(`owner2-${Date.now()}`, `owner2-${Date.now()}@example.com`, 'Owner');
    const admin = user(`admin-${Date.now()}`, `admin-${Date.now()}@example.com`, 'Admin');
    const other = user(`other-${Date.now()}`, `other-${Date.now()}@example.com`, 'Other');
    const created = await organisations.create(owner, 'Delivery');
    const invite = await organisations.invite(owner.id, created.organisation.id, admin.email, 'admin');
    expect((await organisations.acceptInvite(other, created.organisation.id, invite.invitation.token)).status).toBe(403);
    await organisations.acceptInvite(admin, created.organisation.id, invite.invitation.token);
    expect((await organisations.invite(admin.id, created.organisation.id, other.email, 'admin')).status).toBe(403);
    expect((await organisations.getForUser(other.id, created.organisation.id)).status).toBe(403);
  });
});

import { request } from './api';

export type OrganisationRole = 'owner' | 'admin' | 'team-lead' | 'member' | 'stakeholder';
export interface OrganisationSummary {
  id: string; name: string; slug: string; status: string; memberCount: number; teams: Array<{ id: string; name: string; timezone: string; members: Array<{ userId: string; role: string }> }>;
}
export interface OrganisationMember {
  userId: string; email: string; name: string; role: OrganisationRole; status: string; joinedAt: number;
}
export interface OrganisationDetails {
  organisation: OrganisationSummary;
  members: OrganisationMember[];
  teams: OrganisationSummary['teams'];
}
export const organisationApi = {
  list: () => request<{ organisations: OrganisationSummary[] }>('/api/organisations', 'GET'),
  create: (name: string) => request<{ organisation: OrganisationSummary }>('/api/organisations', 'POST', { name }),
  get: (id: string) => request<OrganisationDetails>(`/api/organisations/${id}`, 'GET'),
  createTeam: (id: string, name: string, timezone: string) => request<{ team: OrganisationSummary['teams'][number] }>(`/api/organisations/${id}/teams`, 'POST', { name, timezone }),
  invite: (id: string, email: string, role: OrganisationRole) => request<{ invitation: { id: string; email: string; role: OrganisationRole; expiresAt: number; token: string } }>(`/api/organisations/${id}/invitations`, 'POST', { email, role }),
  accept: (id: string, token: string) => request<{ organisation: OrganisationSummary }>(`/api/organisations/${id}/invitations/accept`, 'POST', { token }),
  setRole: (id: string, userId: string, role: OrganisationRole) => request<{ member: OrganisationMember }>(`/api/organisations/${id}/members/${encodeURIComponent(userId)}`, 'PATCH', { role }),
};

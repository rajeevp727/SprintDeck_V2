import { request } from './api';

export type OrganisationRole = 'owner' | 'admin' | 'team-lead' | 'member' | 'stakeholder';
export interface OrganisationSummary {
  id: string; name: string; slug: string; status: string; memberCount: number; teams: Array<{ id: string; name: string; timezone: string; members: Array<{ userId: string; role: string }>; goals?: Array<{ id: string; title: string; description?: string; target: number; current: number; unit?: string; dueDate?: string | null; status: string }> }>;
}
export interface OrganisationMember {
  userId: string; email: string; name: string; role: OrganisationRole; status: string; joinedAt: number;
}
export interface OrganisationDetails {
  organisation: OrganisationSummary;
  members: OrganisationMember[];
  teams: OrganisationSummary['teams'];
}
export interface WorkspaceAnalytics {
  retrospectiveCount: number; participantCount: number; noteCount: number; actionCount: number;
  completedActions: number; openActions: number; overdueActions: number; completionRate: number | null;
  caveat: string;
  sprints: Array<{ id: string; name: string; endedAt: number; participantCount: number; noteCount: number; actionCount: number; completedActions: number; completionRate: number | null }>;
}
export interface ScrumCoachResult {
  configured: boolean; readOnly: boolean; message?: string; summary?: string;
  suggestions: string[];
  metrics: { retrospectives: number; actionItems: number; completedActions: number; openActions: number; overdueActions: number; completionRate: number | null };
}
export const organisationApi = {
  list: () => request<{ organisations: OrganisationSummary[] }>('/api/organisations', 'GET'),
  create: (name: string) => request<{ organisation: OrganisationSummary }>('/api/organisations', 'POST', { name }),
  get: (id: string) => request<OrganisationDetails>(`/api/organisations/${id}`, 'GET'),
  analytics: (id: string, teamId?: string) => request<WorkspaceAnalytics>(`/api/organisations/${id}/analytics${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`, 'GET'),
  scrumCoach: (id: string, teamId?: string) => request<ScrumCoachResult>(`/api/organisations/${id}/scrum-coach`, 'POST', { teamId }),
  createTeam: (id: string, name: string, timezone: string) => request<{ team: OrganisationSummary['teams'][number] }>(`/api/organisations/${id}/teams`, 'POST', { name, timezone }),
  setTeamMember: (orgId: string, teamId: string, userId: string, role: 'lead' | 'member' | 'stakeholder') => request<{ team: OrganisationSummary['teams'][number] }>(`/api/organisations/${orgId}/teams/${teamId}/members/${encodeURIComponent(userId)}`, 'PUT', { role }),
  createGoal: (orgId: string, teamId: string, data: { title: string; target: number; current: number; unit?: string; dueDate?: string }) => request<{ goal: NonNullable<OrganisationSummary['teams'][number]['goals']>[number] }>(`/api/organisations/${orgId}/teams/${teamId}/goals`, 'POST', data),
  updateGoal: (orgId: string, teamId: string, goalId: string, patch: { current?: number; status?: 'active' | 'at-risk' | 'completed' }) => request<{ goal: NonNullable<OrganisationSummary['teams'][number]['goals']>[number] }>(`/api/organisations/${orgId}/teams/${teamId}/goals/${goalId}`, 'PATCH', patch),
  invite: (id: string, email: string, role: OrganisationRole) => request<{ invitation: { id: string; email: string; role: OrganisationRole; expiresAt: number; token: string } }>(`/api/organisations/${id}/invitations`, 'POST', { email, role }),
  accept: (id: string, token: string) => request<{ organisation: OrganisationSummary }>(`/api/organisations/${id}/invitations/accept`, 'POST', { token }),
  setRole: (id: string, userId: string, role: OrganisationRole) => request<{ member: OrganisationMember }>(`/api/organisations/${id}/members/${encodeURIComponent(userId)}`, 'PATCH', { role }),
};

const activeWorkspaceKey = 'sprintdeck.activeWorkspace';
export function saveActiveWorkspace(value: { organisationId: string; teamId: string }) {
  localStorage.setItem(activeWorkspaceKey, JSON.stringify(value));
}
export function getActiveWorkspace(): { organisationId: string; teamId: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(activeWorkspaceKey) || 'null');
    return value && typeof value.organisationId === 'string' && typeof value.teamId === 'string' ? value : null;
  } catch { return null; }
}

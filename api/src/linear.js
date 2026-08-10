'use strict';

const ENDPOINT = 'https://api.linear.app/graphql';

const identifierRe = /^[A-Z0-9]+-\d+$/;

function isEnabled() {
  return !!process.env.LINEAR_API_KEY;
}

async function graphql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.LINEAR_API_KEY, 
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.errors?.[0]?.message || `Linear request failed (${res.status})`;
    throw new Error(msg);
  }
  if (body?.errors?.length) throw new Error(body.errors[0].message);
  return body?.data ?? {};
}

function normalizeIdentifiers(identifiers) {
  const seen = new Set();
  const clean = [];
  for (const raw of Array.isArray(identifiers) ? identifiers : []) {
    const id = String(raw || '').trim().toUpperCase();
    if (!identifierRe.test(id) || seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
  }
  return clean;
}

async function resolveIssues(identifiers) {
  const ids = normalizeIdentifiers(identifiers);
  if (ids.length === 0) return { resolved: [], missing: [] };

  const fields = 'id identifier title estimate';
  const query = `query { ${ids
    .map((id, i) => `i${i}: issue(id: "${id}") { ${fields} }`)
    .join(' ')} }`;

  const data = await graphql(query);
  const resolved = [];
  const missing = [];
  ids.forEach((id, i) => {
    const issue = data[`i${i}`];
    if (issue?.id) {
      resolved.push({
        identifier: issue.identifier,
        linearId: issue.id,
        title: issue.title,
        estimate: issue.estimate ?? null,
      });
    } else {
      missing.push(id);
    }
  });
  return { resolved, missing };
}

const WORKSPACE = 'trivinna';
const mockEstimationTickets = [
  { identifier: 'ENG-1023', title: '"View All Data" full-screen expansion grouped by section', project: 'Rent Roll Table UI/UX', status: 'Blocked' },
  { identifier: 'ENG-1053', title: 'Lease rollover chart', project: 'Retail Rent Rolls', status: 'Todo' },
  { identifier: 'ENG-1048', title: 'Retail Rent Roll Dashboard', project: 'Retail Rent Rolls', status: 'Todo' },
  { identifier: 'ENG-1041', title: 'Stacking plan card polish for Office type', project: 'Rent Roll Table UI/UX', status: 'Todo' },
  { identifier: 'ENG-1037', title: 'Cumulative rollover summary tiles', project: 'Rent Roll Table UI/UX', status: 'In Review' },
  { identifier: 'ENG-1029', title: 'Multifamily KPI header from rent roll', project: 'Rent Roll Table UI/UX', status: 'Todo' },
];

function getEstimationTickets() {
  return mockEstimationTickets.map((t) => ({
    identifier: t.identifier,
    linearId: `mock-${t.identifier}`,
    title: t.title,
    estimate: null,
    status: t.status,
    project: t.project,
    url: `https://linear.app/${WORKSPACE}/issue/${t.identifier}`,
  }));
}

function isMockId(linearId) {
  return typeof linearId === 'string' && linearId.startsWith('mock-');
}

async function setEstimate(linearId, estimate) {
  const query = `mutation ($id: String!, $estimate: Int!) {
    issueUpdate(id: $id, input: { estimate: $estimate }) {
      success
      issue { identifier estimate }
    }
  }`;
  const data = await graphql(query, { id: linearId, estimate });
  const result = data?.issueUpdate;
  if (!result?.success) throw new Error('Linear rejected the estimate update');
  return { identifier: result.issue?.identifier, estimate: result.issue?.estimate };
}

module.exports = { isEnabled, resolveIssues, setEstimate, getEstimationTickets, isMockId };

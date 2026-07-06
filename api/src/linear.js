'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Linear integration (server-side only).
//
// The Linear API key is a workspace-level secret. It lives ONLY here, read from
// the LINEAR_API_KEY app setting, and is used exclusively when calling Linear's
// GraphQL API. It is never returned to the client. Node 20 has global fetch, so
// there's no HTTP dependency.
// ───────────────────────────────────────────────────────────────────────────
const ENDPOINT = 'https://api.linear.app/graphql';

// A Linear identifier is TEAMKEY-NUMBER, e.g. ENG-876.
const identifierRe = /^[A-Z0-9]+-\d+$/;

function isEnabled() {
  return !!process.env.LINEAR_API_KEY;
}

// Run a GraphQL request. Throws on transport, HTTP or GraphQL errors.
async function graphql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.LINEAR_API_KEY, // personal key — no "Bearer" prefix
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

// Normalize a raw list of pasted ids: trim, upper-case, keep only well-formed
// identifiers, and dedupe (preserving first-seen order).
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

// Resolve identifiers (ENG-876, …) to Linear issues in a single aliased query.
// Returns { resolved: [{identifier, linearId, title, estimate}], missing: [id] }.
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

// ─── MOCK: Estimation view ──────────────────────────────────────────────────
// Stand-in for the Linear "Estimation" custom view
// (https://linear.app/trivinna/team/ENG/view/estimation-809d590ffc82) until the
// OAuth "Connect Linear" flow is wired. Once it is, replace getEstimationTickets()
// with a real customView(id).issues query — the returned shape already matches
// what store.addLinearToQueue() expects, so nothing downstream changes.
const WORKSPACE = 'trivinna';
const mockEstimationTickets = [
  { identifier: 'ENG-1023', title: '"View All Data" full-screen expansion grouped by section', project: 'Rent Roll Table UI/UX', status: 'Blocked' },
  { identifier: 'ENG-1053', title: 'Lease rollover chart', project: 'Retail Rent Rolls', status: 'Todo' },
  { identifier: 'ENG-1048', title: 'Retail Rent Roll Dashboard', project: 'Retail Rent Rolls', status: 'Todo' },
  { identifier: 'ENG-1041', title: 'Stacking plan card polish for Office type', project: 'Rent Roll Table UI/UX', status: 'Todo' },
  { identifier: 'ENG-1037', title: 'Cumulative rollover summary tiles', project: 'Rent Roll Table UI/UX', status: 'In Review' },
  { identifier: 'ENG-1029', title: 'Multifamily KPI header from rent roll', project: 'Rent Roll Table UI/UX', status: 'Todo' },
];

// Tickets awaiting estimation. Shaped like resolveIssues() output so the same
// store.addLinearToQueue() path handles both. `linearId` is a mock id; the push
// endpoint recognises the "mock-" prefix and skips the real Linear API call.
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

// True for a placeholder ticket that isn't backed by a real Linear issue yet.
function isMockId(linearId) {
  return typeof linearId === 'string' && linearId.startsWith('mock-');
}

// Write a story-point estimate onto a Linear issue (by UUID). Returns the
// updated { identifier, estimate }.
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

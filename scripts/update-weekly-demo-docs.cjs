#!/usr/bin/env node
'use strict';

/**
 * Friday weekly demo-doc refresher.
 *
 * - Looks at commits on main from the last 7 days
 * - Ignores pure weekly-doc chore commits (avoids update loops)
 * - If product changes exist, prepends a weekly section and bumps Last updated
 *
 * Usage:
 *   node scripts/update-weekly-demo-docs.cjs
 *   node scripts/update-weekly-demo-docs.cjs --force
 *
 * Exit codes:
 *   0 = updated (or --force with empty week note)
 *   2 = no product changes this week (skip)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs/demo/SprintDeck-Feature-Demo.md');
const INSERT = '<!-- WEEKLY_UPDATES_INSERT_POINT -->';
const force = process.argv.includes('--force');

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function weekLabel(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function collectCommits() {
  // Subject lines from last 7 days on current branch / main tip
  const log = sh(
    'git log --since="7 days ago" --pretty=format:"%h%x09%s" --no-merges -- . ":(exclude)docs/demo" ":(exclude).github/workflows/weekly-demo-docs.yml" ":(exclude)scripts/update-weekly-demo-docs.mjs"',
  );
  if (!log) return [];
  return log
    .split('\n')
    .map((line) => {
      const [hash, ...rest] = line.split('\t');
      const subject = rest.join('\t').trim();
      return { hash, subject };
    })
    .filter((c) => c.hash && c.subject)
    .filter((c) => !/weekly demo docs|update-weekly-demo-docs/i.test(c.subject));
}

function summarize(commits) {
  const bullets = commits.slice(0, 25).map((c) => `- \`${c.hash}\` ${c.subject}`);
  if (commits.length > 25) bullets.push(`- …and ${commits.length - 25} more commits`);
  return bullets.join('\n');
}

function featureHints(commits) {
  const text = commits.map((c) => c.subject.toLowerCase()).join(' ');
  const hints = [];
  if (/poker|room|estimat|vote|reveal/.test(text)) hints.push('Planning Poker');
  if (/retro/.test(text)) hints.push('Retrospective');
  if (/whiteboard|canvas|miro/.test(text)) hints.push('Whiteboard');
  if (/chat/.test(text)) hints.push('Team Chat');
  if (/timesheet|standup/.test(text)) hints.push('Daily Scrum & Timesheet');
  if (/payment|upi|subscription|tier|lifetime|billing/.test(text)) hints.push('Plans & UPI payments');
  if (/auth|password|login|gdpr|privacy|consent|cookie/.test(text)) hints.push('Auth / compliance');
  if (/landing|footer|logo|theme/.test(text)) hints.push('Landing / branding');
  return hints;
}

function main() {
  if (!fs.existsSync(DOC)) {
    console.error('Missing demo doc:', DOC);
    process.exit(1);
  }

  const commits = collectCommits();
  if (!commits.length && !force) {
    console.log('No product changes in the last 7 days — skipping demo doc update.');
    process.exit(2);
  }

  let md = fs.readFileSync(DOC, 'utf8');
  const today = weekLabel();

  // Avoid duplicate section for the same Friday run
  if (md.includes(`### ${today} — Weekly update`) && !force) {
    console.log('Weekly section for', today, 'already present — skipping.');
    process.exit(2);
  }

  md = md.replace(/^(_Last updated: )[0-9-]+(_)/m, `$1${today}$2`);

  const areas = featureHints(commits);
  const areaLine = areas.length
    ? `**Areas touched:** ${areas.join(', ')}`
    : '**Areas touched:** general maintenance';

  const body = commits.length
    ? `${areaLine}\n\n**Commits this week:**\n${summarize(commits)}\n`
    : '_Forced refresh — no product commits detected in the last 7 days._\n';

  const section = `### ${today} — Weekly update\n${body}\n`;

  if (!md.includes(INSERT)) {
    md = `${md.trimEnd()}\n\n${section}`;
  } else {
    md = md.replace(INSERT, `${section}${INSERT}`);
  }

  fs.writeFileSync(DOC, md);
  console.log('Updated', path.relative(ROOT, DOC), `(${commits.length} commits)`);
  process.exit(0);
}

main();

#!/usr/bin/env node
'use strict';

/**
 * Friday weekly demo-doc refresher (two sections).
 *
 * 1) Promote previous "Updated this week" → Features → Feature history
 * 2) Write this week's product commits into "Updated this week"
 *
 * Usage:
 *   node scripts/update-weekly-demo-docs.cjs
 *   node scripts/update-weekly-demo-docs.cjs --force
 *
 * Exit codes:
 *   0 = updated
 *   2 = no product changes this week (skip)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs/demo/SprintDeck-Feature-Demo.md');
const force = process.argv.includes('--force');

const HISTORY_START = '<!-- FEATURES_HISTORY_START -->';
const HISTORY_END = '<!-- FEATURES_HISTORY_END -->';
const WEEK_START = '<!-- UPDATED_THIS_WEEK_START -->';
const WEEK_END = '<!-- UPDATED_THIS_WEEK_END -->';

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function weekLabel(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function collectCommits() {
  const log = sh(
    'git log --since="7 days ago" --pretty=format:"%h%x09%s" --no-merges -- . ":(exclude)docs/demo" ":(exclude).github/workflows/weekly-demo-docs.yml" ":(exclude)scripts/update-weekly-demo-docs.cjs"',
  );
  if (!log) return [];
  return log
    .split('\n')
    .map((line) => {
      const [hash, ...rest] = line.split('\t');
      return { hash, subject: rest.join('\t').trim() };
    })
    .filter((c) => c.hash && c.subject)
    .filter((c) => !/weekly demo docs|update-weekly-demo-docs|feature demo guide/i.test(c.subject));
}

function summarize(commits) {
  const bullets = commits.slice(0, 25).map((c) => `- \`${c.hash}\` ${c.subject}`);
  if (commits.length > 25) bullets.push(`- …and ${commits.length - 25} more commits`);
  return bullets.join('\n');
}

function highlightBullets(commits) {
  return commits
    .slice(0, 12)
    .map((c) => `- ${c.subject.replace(/\s*\(#[0-9]+\)\s*$/, '')}`)
    .join('\n');
}

function featureHints(commits) {
  const text = commits.map((c) => c.subject.toLowerCase()).join(' ');
  const hints = [];
  if (/poker|room|estimat|vote|reveal/.test(text)) hints.push('Planning Poker');
  if (/retro/.test(text)) hints.push('Retrospective');
  if (/whiteboard|canvas|miro/.test(text)) hints.push('Whiteboard');
  if (/chat/.test(text)) hints.push('Team Chat');
  if (/timesheet|standup/.test(text)) hints.push('Daily Scrum & Timesheet');
  if (/payment|upi|subscription|tier|lifetime|billing|free tier/.test(text)) {
    hints.push('Plans & billing');
  }
  if (/auth|password|login|gdpr|privacy|consent|cookie/.test(text)) hints.push('Auth / compliance');
  if (/landing|footer|logo|theme/.test(text)) hints.push('Landing / branding');
  return hints;
}

function extractBlock(md, startMark, endMark) {
  const start = md.indexOf(startMark);
  const end = md.indexOf(endMark);
  if (start < 0 || end < 0 || end <= start) return null;
  return {
    before: md.slice(0, start + startMark.length),
    inner: md.slice(start + startMark.length, end),
    after: md.slice(end),
  };
}

function isPlaceholderWeek(inner) {
  const t = inner.trim();
  if (!t) return true;
  if (/_No product changes this week_/i.test(t)) return true;
  if (/_Waiting for the first Friday refresh_/i.test(t)) return true;
  return false;
}

function alreadyPromoted(historyInner, weekInner) {
  const heading = (weekInner.match(/^###\s+Week of\s+([0-9-]+)/m) || [])[0];
  if (!heading) return false;
  const weekDate = (heading.match(/Week of\s+([0-9-]+)/) || [])[1];
  if (!weekDate) return false;
  // Match either live or already-archived form of that week
  return (
    historyInner.includes(`### Week of ${weekDate}`) ||
    historyInner.includes(`### Archived — Week of ${weekDate}`)
  );
}

function archiveWeekBlock(weekInner, movedOn) {
  return weekInner
    .trim()
    .replace(/^###\s+Week of\s+([0-9-]+)/m, `### Archived — Week of $1 (moved ${movedOn})`);
}

function buildWeekSection(today, commits) {
  if (!commits.length) {
    return `

### Week of ${today}
_No product changes this week._

`;
  }
  const areas = featureHints(commits);
  const areaLine = areas.length
    ? `**Areas touched:** ${areas.join(', ')}`
    : '**Areas touched:** general maintenance';
  return `

### Week of ${today}
${areaLine}

**Highlights**
${highlightBullets(commits)}

**Commits**
${summarize(commits)}

`;
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

  const weekBlock = extractBlock(md, WEEK_START, WEEK_END);
  const historyBlock = extractBlock(md, HISTORY_START, HISTORY_END);
  if (!weekBlock || !historyBlock) {
    console.error('Demo doc is missing required section markers.');
    process.exit(1);
  }

  // Skip if this Friday already wrote the same week heading (unless --force)
  if (weekBlock.inner.includes(`### Week of ${today}`) && !force) {
    console.log('Updated this week already set for', today, '— skipping.');
    process.exit(2);
  }

  // 1) Promote previous "Updated this week" into Features history
  let historyInner = historyBlock.inner;
  const prevWeek = weekBlock.inner;
  if (!isPlaceholderWeek(prevWeek) && !alreadyPromoted(historyInner, prevWeek)) {
    historyInner = `${historyInner.trimEnd()}\n\n${archiveWeekBlock(prevWeek, today)}\n\n`;
    console.log('Promoted previous "Updated this week" into Features history.');
  } else {
    console.log('No previous week content to promote (empty, placeholder, or already promoted).');
  }

  // 2) Write current week into "Updated this week"
  const newWeekInner = buildWeekSection(today, commits);

  md = md.replace(/^(_Last updated: )[0-9-]+(_)/m, `$1${today}$2`);

  // Rebuild from markers carefully
  const hist = extractBlock(md, HISTORY_START, HISTORY_END);
  md = `${hist.before}\n${historyInner.trim()}\n\n${hist.after}`;

  const week = extractBlock(md, WEEK_START, WEEK_END);
  md = `${week.before}${newWeekInner}${week.after}`;

  fs.writeFileSync(DOC, md);
  console.log('Updated', path.relative(ROOT, DOC), `(${commits.length} commits this week)`);
  process.exit(0);
}

main();

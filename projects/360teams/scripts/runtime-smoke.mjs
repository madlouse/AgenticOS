#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const modeArg = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'required';
const mode = modeArg === 'full' ? 'full' : 'required';
const failOnOptional = process.argv.includes('--fail-on-optional');

function runJson(args) {
  try {
    const output = execFileSync('opencli', ['360teams', ...args, '-f', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);
    return { status: 'pass', data };
  } catch (error) {
    const message = String(error.stderr || error.message || '').trim();
    return { status: 'fail', error: message };
  }
}

function countRows(data) {
  return Array.isArray(data) ? data.length : 0;
}

function addResult(results, tier, name, args, outcome, meta = {}) {
  results.push({
    tier,
    name,
    args: `opencli 360teams ${args.join(' ')} -f json`,
    status: outcome.status,
    count: countRows(outcome.data),
    meta,
    error: outcome.error,
  });
}

function firstRow(result) {
  return Array.isArray(result?.data) && result.data.length > 0 ? result.data[0] : null;
}

const results = [];

const requiredChecks = [
  { name: 'status', args: ['status'] },
  { name: 'me', args: ['me'] },
  { name: 'contacts', args: ['contacts', '--limit', '3'] },
  { name: 'conversations', args: ['conversations', '--limit', '3'] },
  { name: 'groups', args: ['groups'] },
  { name: 'docs.status', args: ['docs', '--action', 'status'] },
  { name: 't5t.status', args: ['t5t', '--action', 'status'] },
];

const requiredOutputs = {};
for (const check of requiredChecks) {
  const outcome = runJson(check.args);
  requiredOutputs[check.name] = outcome;
  addResult(results, 'required-safe', check.name, check.args, outcome);
}

if (mode === 'full') {
  const optionalChecks = [
    { name: 'calendar.today', args: ['calendar', '--action', 'today', '--limit', '3'] },
    { name: 'rooms', args: ['rooms'] },
    { name: 'docs.shared', args: ['docs', '--action', 'shared', '--limit', '3'] },
    { name: 'docs.recent', args: ['docs', '--action', 'recent', '--limit', '3'] },
    { name: 'docs.favorites', args: ['docs', '--action', 'favorites', '--limit', '3'] },
    { name: 't5t.history', args: ['t5t', '--action', 'history', '--limit', '3'] },
    { name: 'todo.list', args: ['todo', '--action', 'list', '--limit', '3'] },
  ];

  const optionalOutputs = {};
  for (const check of optionalChecks) {
    const outcome = runJson(check.args);
    optionalOutputs[check.name] = outcome;
    addResult(results, 'optional-read', check.name, check.args, outcome);
  }

  const firstContact = firstRow(requiredOutputs.contacts);
  if (firstContact?.Name) {
    const keyword = String(firstContact.Name).slice(0, 2) || String(firstContact.Name).slice(0, 1);
    const outcome = runJson(['search', '--name', keyword, '--limit', '3']);
    addResult(results, 'optional-read', 'search', ['search', '--name', keyword, '--limit', '3'], outcome, { keyword });
  } else {
    results.push({
      tier: 'optional-read',
      name: 'search',
      args: 'opencli 360teams search --name <derived> --limit 3 -f json',
      status: 'skip',
      meta: { reason: 'no contact seed available from contacts' },
    });
  }

  const firstConversation = firstRow(requiredOutputs.conversations);
  if (firstConversation?.TargetId) {
    const type = firstConversation.Type === 'GROUP' ? 'GROUP' : 'PRIVATE';
    const args = ['read', '--target', String(firstConversation.TargetId), '--type', type, '--limit', '3'];
    const outcome = runJson(args);
    addResult(results, 'optional-read', 'read', args, outcome, {
      target: firstConversation.TargetId,
      type,
    });
  } else {
    results.push({
      tier: 'optional-read',
      name: 'read',
      args: 'opencli 360teams read --target <derived> --type <derived> --limit 3 -f json',
      status: 'skip',
      meta: { reason: 'no conversation seed available from conversations' },
    });
  }

  let firstDoc = firstRow(optionalOutputs['docs.shared']);
  if (!firstDoc?.Name || String(firstDoc.Name).startsWith('No documents')) {
    firstDoc = firstRow(optionalOutputs['docs.recent']);
  }
  if (firstDoc?.Name && !String(firstDoc.Name).startsWith('No documents')) {
    const query = String(firstDoc.Name).slice(0, 2) || String(firstDoc.Name).slice(0, 1);
    const searchArgs = ['docs', '--action', 'search', '--query', query, '--limit', '3'];
    addResult(results, 'optional-read', 'docs.search', searchArgs, runJson(searchArgs), { query });

    const readArgs = ['docs', '--action', 'read', '--name', String(firstDoc.Name), '--limit', '3'];
    addResult(results, 'optional-read', 'docs.read', readArgs, runJson(readArgs), { name: firstDoc.Name });
  } else {
    results.push({
      tier: 'optional-read',
      name: 'docs.search',
      args: 'opencli 360teams docs --action search --query <derived> --limit 3 -f json',
      status: 'skip',
      meta: { reason: 'no document seed available from docs.shared/docs.recent' },
    });
    results.push({
      tier: 'optional-read',
      name: 'docs.read',
      args: 'opencli 360teams docs --action read --name <derived> --limit 3 -f json',
      status: 'skip',
      meta: { reason: 'no document seed available from docs.shared/docs.recent' },
    });
  }
}

const summary = results.reduce((acc, result) => {
  const bucket = acc[result.tier] || { pass: 0, fail: 0, skip: 0 };
  bucket[result.status] += 1;
  acc[result.tier] = bucket;
  return acc;
}, {});

const payload = {
  mode,
  generatedAt: new Date().toISOString(),
  summary,
  results,
};

console.log(JSON.stringify(payload, null, 2));

const requiredFailed = results.some(
  (result) => result.tier === 'required-safe' && result.status === 'fail'
);
const optionalFailed = results.some(
  (result) => result.tier === 'optional-read' && result.status === 'fail'
);

if (requiredFailed || (failOnOptional && optionalFailed)) {
  process.exit(1);
}

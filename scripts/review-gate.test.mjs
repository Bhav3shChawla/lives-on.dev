import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/review-gate.yml', 'utf8');
const source = workflow.split('          script: |\n')[1]
  ?.split('\n')
  .map((line) => line.startsWith('            ') ? line.slice(12) : line)
  .join('\n');
assert.ok(source, 'Review workflow script exists');
const run = new Function('github', 'context', 'return (async () => {\n' + source + '\n})()');

async function statusesFor(branch, comments = []) {
  const sha = 'a'.repeat(40);
  const pr = { state: 'open', head: { sha, ref: branch }, html_url: 'https://github.com/Bhav3shChawla/lives-on.dev/pull/1' };
  const statuses = [];
  const github = {
    rest: {
      pulls: { get: async () => ({ data: pr }) },
      checks: { listForRef: async () => ({ data: { check_runs: [{
        id: 1, name: 'validate', app: { id: 15368 }, head_sha: sha,
        status: 'completed', conclusion: 'success',
      }] } }) },
      issues: { listComments: () => {} },
      repos: { createCommitStatus: async (status) => { statuses.push(status); } },
    },
    paginate: async () => comments,
  };
  const context = {
    repo: { owner: 'Bhav3shChawla', repo: 'lives-on.dev' },
    issue: { number: 1 },
    payload: { pull_request: { number: 1, head: { sha } } },
  };
  await run(github, context);
  return statuses;
}

test('new submitted names do not get a late pending status over automatic approval', async () => {
  const statuses = await statusesFor('requests/123/example/r2-submit-123456789');
  assert.deepEqual(statuses.map((status) => [status.context, status.state]),
    [['registry-validation', 'success']]);
});

test('changes outside automatic submissions remain pending for maintainer review', async () => {
  const statuses = await statusesFor('updates/example-records');
  assert.deepEqual(statuses.map((status) => [status.context, status.state]),
    [['registry-validation', 'success'], ['maintainer-approval', 'pending']]);
});

test('an exact maintainer approval still works for a submitted name', async () => {
  const statuses = await statusesFor('requests/123/example/r2-submit-123456789', [
    { user: { login: 'Bhav3shChawla' }, body: '/approve ' + 'a'.repeat(40) },
  ]);
  assert.deepEqual(statuses.map((status) => [status.context, status.state]),
    [['registry-validation', 'success'], ['maintainer-approval', 'success']]);
});

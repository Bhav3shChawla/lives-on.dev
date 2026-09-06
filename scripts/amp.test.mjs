import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER, assertCommand, assertRequest, selectDnsScope } from '../lib/amp-policy.mjs';
const user = { ...OWNER, type: 'User' };
function fixture() {
  const comment = { id: 123, user: { ...user }, body: '/amp', created_at: '2026-09-07T00:00:10Z', updated_at: '2026-09-07T00:00:10Z' };
  return {
    comment,
    event: { repository: { full_name: 'Bhav3shChawla/lives-on.dev' }, action: 'created', sender: { ...user }, comment: structuredClone(comment), issue: { number: 1, pull_request: {} } },
    pr: { base: { repo: { full_name: 'Bhav3shChawla/lives-on.dev' }, ref: 'main' }, state: 'open', head: { sha: 'a'.repeat(40) }, updated_at: comment.created_at },
    files: [{ filename: 'registry/domains/example.json', status: 'added' }],
    checks: [{ id: 1, name: 'validate', app: { id: 15368 }, head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success', completed_at: '2026-09-07T00:00:01Z' }],
  };
}
test('owner command accepts a green exact domain revision', () => {
  const f = fixture(); assertCommand(f.event, f.comment);
  assert.equal(assertRequest(f.pr, f.files, f.checks, f.comment), 'example');
});
test('other accounts and modified or replayed commands cannot approve', () => {
  for (const mutate of [
    f => f.event.sender.id = 1,
    f => f.comment.user.id = 1,
    f => f.comment.body = '/amp please',
    f => f.comment.updated_at = '2026-09-07T00:00:11Z',
    f => f.event.action = 'edited',
    f => f.event.repository.full_name = 'other/repo',
  ]) { const f = fixture(); mutate(f); assert.throws(() => assertCommand(f.event, f.comment)); }
  const f = fixture(); assert.throws(() => assertCommand(f.event, f.comment, '2'));
});
test('PR changes, newer checks, foreign checks and failures stop approval', () => {
  for (const mutate of [
    f => f.pr.updated_at = '2026-09-07T00:00:11Z',
    f => f.pr.head.sha = 'b'.repeat(40),
    f => f.checks[0].completed_at = '2026-09-07T00:00:12Z',
    f => f.checks[0].conclusion = 'failure',
    f => f.checks[0].app.id = 1,
    f => f.checks.push({ ...f.checks[0], id: 2, conclusion: 'failure' }),
    f => f.pr.base.ref = 'other',
    f => f.pr.draft = true,
  ]) { const f = fixture(); mutate(f); assert.throws(() => assertRequest(f.pr, f.files, f.checks, f.comment)); }
});
test('code, workflows, traversal, renames and multi-record requests fail closed', () => {
  for (const filename of ['.github/workflows/dns.yml', 'scripts/dns-sync.mjs', 'registry/domains/../../x.json', 'registry/domains/sub.example.json', 'registry/reserved.json']) {
    const f = fixture(); f.files[0].filename = filename; assert.throws(() => assertRequest(f.pr, f.files, f.checks, f.comment));
  }
  const f = fixture(); f.files.push({ ...f.files[0] }); assert.throws(() => assertRequest(f.pr, f.files, f.checks, f.comment));
  const g = fixture(); g.files[0].status = 'renamed'; assert.throws(() => assertRequest(g.pr, g.files, g.checks, g.comment));
});
test('DNS scope preserves unrelated managed and unmanaged records', () => {
  const own = { name: 'example.lives-on.dev', comment: 'lives-on.dev:registry' };
  const other = { name: 'bhavesh.lives-on.dev', comment: 'lives-on.dev:registry' };
  const mail = { name: 'lives-on.dev', type: 'MX' };
  const selection = selectDnsScope([own, other, mail], [own, other], own.name);
  assert.deepEqual(selection, { managed: [own], unmanaged: [mail], wanted: [own] });
  assert.deepEqual(selectDnsScope([own, other], [], own.name).managed, [own]);
  for (const name of ['lives-on.dev', '*.lives-on.dev', 'example.evil.dev', '../example.lives-on.dev'])
    assert.throws(() => selectDnsScope([], [], name));
});

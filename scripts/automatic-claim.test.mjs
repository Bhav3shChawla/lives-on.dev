import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimFromRequest, assertNewNamePlan } from '../lib/automatic-claim.mjs';

function fixture() {
  const name = 'example';
  const data = { owner: { username: 'sample-owner', id: 123 }, records: { CNAME: 'sample-owner.pages.dev' }, proxied: false };
  const pr = {
    state: 'open', draft: false, changed_files: 1,
    base: { ref: 'main', repo: { full_name: 'Bhav3shChawla/lives-on.dev' } },
    head: { ref: 'requests/123/example/r2-submit-123456789', repo: { full_name: 'Bhav3shChawla/lives-on.dev' } },
    body: 'Requested through lives-on.dev by @sample-owner (ID 123).',
  };
  const files = [{ filename: 'registry/domains/' + name + '.json', status: 'added', sha: 'a'.repeat(40) }];
  return {
    pr, data, files, definitions: { [files[0].filename]: data },
    account: { id: 123, login: 'sample-owner', type: 'User' },
    reserved: { names: {} },
  };
}

test('an available first claim must match its GitHub identity and request branch', () => {
  const good = fixture();
  assert.deepEqual(claimFromRequest(good.pr, good.files, good.definitions, good.reserved, good.account), {
    name: 'example', names: ['example'],
    files: [{ name: 'example', filename: 'registry/domains/example.json', blob: 'a'.repeat(40) }],
  });
  for (const change of [
    f => { f.files[0].status = 'modified'; },
    f => { f.files.push({ filename: 'registry/domains/other.json', status: 'added' }); f.pr.changed_files = 2; },
    f => { f.pr.head.repo.full_name = 'other/repo'; },
    f => { f.pr.head.ref = 'requests/999/example/r2-submit-123456789'; },
    f => { f.pr.head.ref = 'requests/123/other/r2-submit-123456789'; },
    f => { f.pr.draft = true; },
    f => { f.data.owner.id = 999; },
    f => { f.account.id = 999; },
    f => { f.account.type = 'Organization'; },
    f => { f.pr.body = ''; },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(claimFromRequest(f.pr, f.files, f.definitions, f.reserved, f.account), null);
  }
});

test('new claims can include verification records owned by the same person', () => {
  const f = fixture();
  const file = { filename: 'registry/domains/_verify.example.json', status: 'added', sha: 'b'.repeat(40) };
  f.files.push(file);
  f.pr.changed_files = 2;
  f.definitions[file.filename] = {
    owner: { username: f.account.login, id: f.account.id }, records: { TXT: 'verify=example' }, proxied: false,
  };
  assert.deepEqual(claimFromRequest(f.pr, f.files, f.definitions, f.reserved, f.account)?.names,
    ['example', '_verify.example']);
  f.definitions[file.filename].owner.id = 999;
  assert.equal(claimFromRequest(f.pr, f.files, f.definitions, f.reserved, f.account), null);
});

test('reserved names and invalid DNS records never qualify', () => {
  const reserved = fixture();
  reserved.reserved.names.example = {};
  assert.throws(() => claimFromRequest(reserved.pr, reserved.files, reserved.definitions, reserved.reserved, reserved.account));
  const invalid = fixture();
  invalid.data.records.CNAME = 'http://not-a-host';
  assert.throws(() => claimFromRequest(invalid.pr, invalid.files, invalid.definitions, invalid.reserved, invalid.account));
});

test('publication plan cannot replace an existing name or touch another name', () => {
  const record = { name: 'example.lives-on.dev', comment: 'lives-on.dev:registry' };
  const plan = {
    zone: 'lives-on.dev', scope: ['example.lives-on.dev'], before: [],
    changes: { deletes: [], posts: [record] },
  };
  assert.doesNotThrow(() => assertNewNamePlan(plan, ['example']));
  for (const change of [
    p => { p.before = [record]; },
    p => { p.changes.deletes = [{ id: 'existing' }]; },
    p => { p.changes.posts = []; },
    p => { p.changes.posts[0].name = 'other.lives-on.dev'; },
    p => { p.scope = ['other.lives-on.dev']; },
  ]) {
    const copy = structuredClone(plan);
    change(copy);
    assert.throws(() => assertNewNamePlan(copy, ['example']));
  }
});

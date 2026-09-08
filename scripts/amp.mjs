import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { assertCommand, assertRequest, requestWithRetry } from '../lib/amp-policy.mjs';
import { validateDefinition } from '../lib/validate-record.mjs';
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repo = 'Bhav3shChawla/lives-on.dev';
const prefix = '/repos/' + repo;
const number = event.issue?.number;
const run = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
async function api(path, method = 'GET', body) {
  const r = await requestWithRetry('https://api.github.com' + path, { method,
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`GitHub ${method} ${path} failed (${r.status}).`);
  return r.status === 204 ? null : r.json();
}
async function commentNow() {
  const c = await api(prefix + '/issues/comments/' + event.comment.id);
  assertCommand(event, c, process.env.GITHUB_RUN_ATTEMPT);
  return c;
}
async function fileAt(ref, filename) {
  const r = await requestWithRetry(`https://api.github.com${prefix}/contents/${filename}?ref=${ref}`, {
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Could not verify the published record.');
  const value = await r.json();
  if (value.type !== 'file') throw new Error('Only regular record files are supported.');
  return value.sha;
}
const mode = process.argv[2];
if (mode === 'prepare') {
  const comment = await commentNow();
  const pr = await api(prefix + '/pulls/' + number);
  const files = await api(prefix + '/pulls/' + number + '/files?per_page=100');
  if (pr.changed_files !== files.length) throw new Error('Too many changed files.');
  const checks = await api(prefix + '/commits/' + pr.head.sha + '/check-runs?per_page=100');
  const names = assertRequest(pr, files, checks.check_runs, comment);
  const records=files.flatMap(file=>[...(file.status==='renamed'?[{filename:file.previous_filename,blob:null}]:[]),{filename:file.filename,blob:file.status==='removed'?null:file.sha}]);
  const state = { number, name:names.join(', '), names, files:records, head:pr.head.sha, merged:Boolean(pr.merged) };
  await writeFile('amp-state.json', JSON.stringify(state));
  const main = await api(prefix + '/git/ref/heads/main');
  if (main.object.sha !== process.env.GITHUB_SHA) throw new Error('Main changed while this approval waited. Post a fresh /amp.');
  for(const file of state.files){
    if(pr.merged && await fileAt(main.object.sha,file.filename)!==file.blob)throw Error('An approved record is no longer current.');
    if(file.blob){
      const headRepo=pr.head.repo?.full_name||repo;
      if(!/^[\w.-]+\/[\w.-]+$/.test(headRepo))throw Error('Invalid source repository.');
      const blob=await api(`/repos/${headRepo}/git/blobs/${file.blob}`);
      if(blob.encoding!=='base64'||blob.size>16384)throw Error('Invalid record blob.');
      const data=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
      validateDefinition(file.filename.slice('registry/domains/'.length,-5),data,JSON.parse(await readFile('registry/reserved.json','utf8')));
      await writeFile(file.filename,JSON.stringify(data,null,2)+'\n');
    }else await unlink(file.filename).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
  execFileSync(process.execPath, ['scripts/validate-registry.mjs'], { stdio: 'inherit' });
  await commentNow();
  const fresh = await api(prefix + '/pulls/' + number);
  if (fresh.head.sha !== state.head || fresh.base.ref !== 'main') throw new Error('PR revision changed. Post a fresh /amp.');
  if (!pr.merged) {
    await api(prefix + '/statuses/' + state.head, 'POST', { state: 'success', context: 'maintainer-approval', description: 'Owner /amp approval for this exact validated revision', target_url: run });
    const merged = await api(prefix + '/pulls/' + number + '/merge', 'PUT', { sha: state.head, merge_method: 'squash' });
    if (!merged.merged) throw new Error('Merge blocked by required checks or branch protection.');
    state.merged = true;
    state.merge = merged.sha;
    await writeFile('amp-state.json', JSON.stringify(state));
  }
  console.log('Approved and merged request for ' + state.name);
} else if (mode === 'scope') {
  const state = JSON.parse(await readFile('amp-state.json', 'utf8'));
  process.stdout.write(JSON.stringify(state.names.map(name=>name+'.lives-on.dev')));
} else if (mode === 'recheck') {
  await commentNow();
  const state = JSON.parse(await readFile('amp-state.json', 'utf8'));
  const pr = await api(prefix + '/pulls/' + number);
  const main = await api(prefix + '/git/ref/heads/main');
  if (!pr.merged || pr.head.sha !== state.head) throw Error('The approved request changed.');
  for(const file of state.files)if(await fileAt(main.object.sha,file.filename)!==file.blob)throw Error('An approved record is no longer current. DNS publication stopped.');
} else if (mode === 'report') {
  let state;
  try { state = JSON.parse(await readFile('amp-state.json', 'utf8')); } catch { state = {}; }
  try { state.merged = (await api(prefix + '/pulls/' + number)).merged; } catch { /* Preserve the last confirmed state. */ }
  const success = process.env.AMP_RESULT === 'success';
  await api(prefix + '/issues/' + number + '/comments', 'POST', { body: success
    ? `✅ /amp completed: approved, merged, and published DNS for **${state.name}.lives-on.dev**. DNS caches and hosting HTTPS provisioning may take time. [Run details](${run}).`
    : `❌ /amp stopped. ${state.merged ? 'The PR is merged, but DNS publication did not finish.' : 'Approval/merge/publication did not complete.'} Review the failed step in [run details](${run}). After correcting it, post a new /amp; a merged PR can retry publication if its record is unchanged.` });
} else throw new Error('Unknown AMP operation.');

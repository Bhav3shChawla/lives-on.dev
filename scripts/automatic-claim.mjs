import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { claimFromRequest, assertNewNamePlan } from '../lib/automatic-claim.mjs';
import { requestWithRetry } from '../lib/amp-policy.mjs';

const repo = 'Bhav3shChawla/lives-on.dev';
const prefix = '/repos/' + repo;
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const number = event.pull_request?.number;
const runUrl = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const stateFile = 'automatic-claim-state.json';

async function api(path, method = 'GET', body) {
  const response = await requestWithRetry('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.GH_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function fileAt(ref, filename) {
  const response = await requestWithRetry(
    `https://api.github.com${prefix}/contents/${filename}?ref=${encodeURIComponent(ref)}`,
    {
      headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not verify the current registry.');
  return response.json();
}

async function greenValidation(head) {
  const checks = await api(prefix + '/commits/' + head + '/check-runs?check_name=validate&per_page=100');
  const latest = checks.check_runs
    .filter(check => check.name === 'validate' && check.app?.id === 15368 && check.head_sha === head)
    .sort((a, b) => b.id - a.id)[0];
  return latest?.status === 'completed' && latest.conclusion === 'success';
}

async function waitForValidation(head) {
  for (let attempt = 0; attempt < 36; attempt++) {
    if (await greenValidation(head)) return;
    const current = await api(prefix + '/pulls/' + number);
    if (current.state !== 'open' || current.head.sha !== head) throw new Error('The request changed while validation ran.');
    await pause(5000);
  }
  throw new Error('Validation did not pass within three minutes.');
}

async function mainSha() {
  return (await api(prefix + '/git/ref/heads/main')).object.sha;
}

async function currentState() {
  return JSON.parse(await readFile(stateFile, 'utf8'));
}

async function saveState(state) {
  await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');
}

const mode = process.argv[2];
if (mode === 'prepare') {
  if (event.repository?.full_name !== repo ||
      !['opened', 'synchronize', 'reopened'].includes(event.action) ||
      !Number.isInteger(number)) throw new Error('Unsupported request event.');
  let pr = await api(prefix + '/pulls/' + number);
  if (pr.head.sha !== event.pull_request.head.sha || pr.state !== 'open') {
    await appendFile(process.env.GITHUB_OUTPUT, 'eligible=false\n');
    console.log('Superseded or closed request; no publication.');
    process.exit(0);
  }
  let files = await api(prefix + '/pulls/' + number + '/files?per_page=100');
  if (!files.length || files.length > 22 || files.some(file =>
    file.status !== 'added' || !/^registry\/domains\/[a-z0-9_.-]+\.json$/.test(file.filename))) {
    await appendFile(process.env.GITHUB_OUTPUT, 'eligible=false\n');
    console.log('Changes to existing names and multi-file requests remain in review.');
    process.exit(0);
  }
  const definitions = {};
  for (const file of files) {
    const blob = await api(prefix + '/git/blobs/' + file.sha);
    if (blob.encoding !== 'base64' || blob.size > 16384) throw new Error('Invalid record file.');
    definitions[file.filename] = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
  }
  const branchName = /^requests\/[0-9]+\/([a-z0-9-]+)\//.exec(pr.head.ref)?.[1];
  const root = definitions['registry/domains/' + branchName + '.json'];
  if (!root) throw new Error('The submitted parent record is missing.');
  const account = await api('/users/' + encodeURIComponent(root.owner?.username || ''));
  const reserved = JSON.parse(await readFile('registry/reserved.json', 'utf8'));
  let claim = claimFromRequest(pr, files, definitions, reserved, account);
  if (!claim) throw new Error('The new claim does not match its owner or request branch.');
  let main = await mainSha();
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== main)
    throw new Error('The trusted checkout is no longer current.');
  for (const file of claim.files)
    if (await fileAt(main, file.filename)) throw new Error('This name is already registered.');
  const state = { eligible: true, number, ...claim, head: pr.head.sha, main, merged: false };
  await saveState(state);
  await appendFile(process.env.GITHUB_OUTPUT, 'eligible=true\n');

  const comparison = await api(prefix + '/compare/' + pr.head.sha + '...' + main);
  if (comparison.ahead_by > 0) {
    await api(prefix + '/pulls/' + number + '/update-branch', 'PUT', { expected_head_sha: pr.head.sha });
    let updated = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      await pause(2500);
      pr = await api(prefix + '/pulls/' + number);
      if (pr.head.sha !== state.head) { updated = true; break; }
    }
    if (!updated) throw new Error('The request branch did not refresh.');
    state.head = pr.head.sha;
    await saveState(state);
    await api(prefix + '/actions/workflows/validate.yml/dispatches', 'POST', { ref: pr.head.ref });
  }
  await waitForValidation(state.head);
  pr = await api(prefix + '/pulls/' + number);
  files = await api(prefix + '/pulls/' + number + '/files?per_page=100');
  claim = claimFromRequest(pr, files, definitions, reserved, account);
  if (!claim || pr.head.sha !== state.head ||
      JSON.stringify(claim.files) !== JSON.stringify(state.files))
    throw new Error('The validated request changed.');
  if (await mainSha() !== main) throw new Error('Main changed during validation.');
  for (const file of claim.files) {
    if (await fileAt(main, file.filename)) throw new Error('The name changed during validation.');
    await writeFile(file.filename, JSON.stringify(definitions[file.filename], null, 2) + '\n');
  }
  execFileSync(process.execPath, ['scripts/validate-registry.mjs'], { stdio: 'inherit' });
  console.log('New claim validated for ' + state.name);
} else if (mode === 'scope') {
  const state = await currentState();
  process.stdout.write(JSON.stringify(state.names.map(name => name + '.lives-on.dev')));
} else if (mode === 'verify-plan') {
  const state = await currentState();
  assertNewNamePlan(JSON.parse(await readFile('dns-plan.json', 'utf8')), state.names);
  console.log('The DNS plan creates only the available name.');
} else if (mode === 'merge') {
  const state = await currentState();
  const pr = await api(prefix + '/pulls/' + number);
  if (pr.state !== 'open' || pr.head.sha !== state.head || await mainSha() !== state.main ||
      !await greenValidation(state.head))
    throw new Error('The request or available name changed before merge.');
  for (const file of state.files)
    if (await fileAt(state.main, file.filename))
      throw new Error('A submitted name is already registered.');
  assertNewNamePlan(JSON.parse(await readFile('dns-plan.json', 'utf8')), state.names);
  await api(prefix + '/statuses/' + state.head, 'POST', {
    state: 'success', context: 'maintainer-approval',
    description: 'Available name and record validated for publication', target_url: runUrl,
  });
  const merged = await api(prefix + '/pulls/' + number + '/merge', 'PUT', {
    sha: state.head, merge_method: 'squash',
  });
  if (!merged.merged) throw new Error('Merge blocked by required checks or branch protection.');
  state.merged = true;
  state.merge = merged.sha;
  await saveState(state);
} else if (mode === 'recheck') {
  const state = await currentState();
  const pr = await api(prefix + '/pulls/' + number);
  if (!state.merged || !pr.merged || pr.head.sha !== state.head)
    throw new Error('The published claim changed before DNS application.');
  const main = await mainSha();
  for (const file of state.files)
    if ((await fileAt(main, file.filename))?.sha !== file.blob)
      throw new Error('A published record changed before DNS application.');
} else if (mode === 'report') {
  const state = await currentState();
  if (process.env.AUTO_RESULT !== 'success' && !state.merged) {
    await api(prefix + '/statuses/' + state.head, 'POST', {
      state: 'failure', context: 'maintainer-approval',
      description: 'Automatic publication stopped; review the run', target_url: runUrl,
    });
  }
  const message = process.env.AUTO_RESULT === 'success'
    ? `✅ ${state.name}.lives-on.dev was approved and its DNS record published. Configure the name with your hosting provider; HTTPS may take time. [Run details](${runUrl}).`
    : `Automatic publication stopped for ${state.name}.lives-on.dev. ${state.merged ? 'The request merged, but DNS publication needs repair.' : 'The request remains open for review.'} [Run details](${runUrl}).`;
  await api(prefix + '/issues/' + number + '/comments', 'POST', { body: message });
} else {
  throw new Error('Unknown automatic claim operation.');
}

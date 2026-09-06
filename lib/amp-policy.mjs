export const OWNER = { login: 'Bhav3shChawla', id: 282984756 };
export async function requestWithRetry(url, options, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const safe = (options.method || 'GET') === 'GET';
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try { response = await fetcher(url, options); }
    catch (error) {
      if (!safe || attempt === 3) throw error;
      await pause(1000 * 2 ** attempt); continue;
    }
    if (safe && attempt < 3 && [429, 500, 502, 503, 504].includes(response.status)) {
      await pause(Math.min(30000, Math.max(1000 * 2 ** attempt, Number(response.headers.get('Retry-After') || 0) * 1000)));
      continue;
    }
    return response;
  }
}
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
export function assertCommand(event, comment, attempt = '1') {
  ensure(event.repository?.full_name === 'Bhav3shChawla/lives-on.dev', 'Wrong repository.');
  ensure(event.action === 'created' && event.issue?.pull_request, 'Use a new PR comment.');
  ensure(String(attempt) === '1', 'Post a fresh /amp comment instead of rerunning an old approval.');
  for (const user of [event.sender, event.comment?.user, comment.user])
    ensure(user?.id === OWNER.id && user?.login === OWNER.login && user?.type === 'User', 'Only the maintainer can approve.');
  ensure(comment.id === event.comment.id && comment.body?.trim() === '/amp' && event.comment.body?.trim() === '/amp', 'Approval comment changed or was removed.');
  ensure(comment.created_at === comment.updated_at && comment.created_at === event.comment.created_at, 'Edited comments cannot approve. Post a new /amp.');
  ensure(Number.isFinite(Date.parse(comment.created_at)), 'Invalid approval timestamp.');
}
export function assertRequest(pr, files, checks, comment) {
  ensure(pr.base?.repo?.full_name === 'Bhav3shChawla/lives-on.dev' && pr.base.ref === 'main', 'Only requests into main are supported.');
  ensure(!pr.draft && (pr.state === 'open' || pr.merged), 'The PR must be open or previously merged.');
  ensure(/^[a-f0-9]{40}$/.test(pr.head.sha), 'Invalid revision.');
  ensure(Date.parse(pr.updated_at) <= Date.parse(comment.created_at), 'The request changed after approval. Review it and post a fresh /amp.');
  ensure(files.length === 1, '/amp accepts one domain record per request.');
  const file = files[0];
  ensure(/^registry\/domains\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.json$/.test(file.filename), '/amp cannot merge code, workflow, policy, or configuration changes.');
  ensure(['added', 'modified', 'removed'].includes(file.status), 'Renames are not supported.');
  const validations = checks.filter(c => c.name === 'validate' && c.app?.id === 15368 && c.head_sha === pr.head.sha)
    .sort((a,b) => b.id - a.id);
  const check = validations[0];
  ensure(check?.status === 'completed' && check.conclusion === 'success' && Date.parse(check.completed_at) < Date.parse(comment.created_at), 'Wait for validation to turn green, then post /amp on that revision.');
  return file.filename.slice('registry/domains/'.length, -5);
}
export function selectDnsScope(live, wanted, scope) {
  if (scope) ensure(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.lives-on\.dev$/.test(scope), 'Invalid DNS scope.');
  return {
    managed: live.filter(r => r.comment === 'lives-on.dev:registry' && (!scope || r.name === scope)),
    unmanaged: live.filter(r => r.comment !== 'lives-on.dev:registry'),
    wanted: wanted.filter(r => !scope || r.name === scope),
  };
}

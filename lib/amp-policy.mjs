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
  ensure(files.length >= 1 && files.length <= 22, 'Use at most 22 record files.');
  const names=[];
  for(const file of files){
    ensure(['added','modified','removed','renamed'].includes(file.status),'Unsupported change.');
    for(const path of [file.filename,...(file.status==='renamed'?[file.previous_filename]:[])]){
      ensure(typeof path==='string' && /^registry\/domains\/[a-z0-9_.-]+\.json$/.test(path),'Only registry records may be approved.');
      const name=path.slice('registry/domains/'.length,-5),parts=name.split('.');
      ensure(parts.length<=2 && parts.every(p=>p.length<=63 && /^_?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)) && !parts.at(-1).startsWith('_'),'Invalid record path.');
      names.push(name);
    }
  }
  ensure(new Set(names).size === names.length, 'Duplicate record paths are not supported.');
  const validations = checks.filter(c => c.name === 'validate' && c.app?.id === 15368 && c.head_sha === pr.head.sha)
    .sort((a,b) => b.id - a.id);
  const check = validations[0];
  ensure(check?.status === 'completed' && check.conclusion === 'success' && Date.parse(check.completed_at) < Date.parse(comment.created_at), 'Wait for validation to turn green, then post /amp on that revision.');
  return [...new Set(names)];
}
export function selectDnsScope(live,wanted,scope){
  const names=scope?(Array.isArray(scope)?scope:[scope]):null;
  if(names)ensure(names.length>0&&names.length<=22&&names.every(n=>typeof n==='string'&&n.endsWith('.lives-on.dev')&&n.slice(0,-'.lives-on.dev'.length).split('.').every(p=>p.length<=63&&/^_?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p))),'Invalid DNS scope.');
  return {managed:live.filter(r=>r.comment==='lives-on.dev:registry'&&(!names||names.includes(r.name))),unmanaged:live.filter(r=>r.comment!=='lives-on.dev:registry'),wanted:wanted.filter(r=>!names||names.includes(r.name))};
}

import { validateDefinition } from './validate-record.mjs';

const repository = 'Bhav3shChawla/lives-on.dev';

export function claimFromRequest(pr, files, definitions, reserved, account) {
  if (pr.state !== 'open' || pr.draft || pr.base?.repo?.full_name !== repository || pr.base.ref !== 'main') return null;
  if (pr.head?.repo?.full_name !== repository || !files.length || files.length > 22 ||
      pr.changed_files !== files.length) return null;
  const branch = /^requests\/([0-9]+)\/([a-z0-9-]+)\/r[0-9]+-submit-[0-9]+$/.exec(pr.head.ref);
  if (!branch) return null;
  const name = branch[2];
  const root = definitions['registry/domains/' + name + '.json'];
  if (!root || Number(branch[1]) !== root.owner?.id) return null;
  if (account?.type !== 'User' || account.id !== root.owner.id ||
      account.login?.toLowerCase() !== root.owner.username.toLowerCase()) return null;
  if (!pr.body?.includes(`Requested through lives-on.dev by @${account.login} (ID ${account.id}).`)) return null;
  const entries = [];
  for (const file of files) {
    if (file.status !== 'added') return null;
    const match = /^registry\/domains\/(_?[a-z0-9-]+(?:\.[a-z0-9-]+)?)\.json$/.exec(file.filename);
    if (!match || (match[1] !== name && !match[1].endsWith('.' + name))) return null;
    const data = definitions[file.filename];
    if (!data || data.owner?.id !== account.id ||
        data.owner.username.toLowerCase() !== account.login.toLowerCase()) return null;
    validateDefinition(match[1], data, reserved);
    entries.push({ name: match[1], filename: file.filename, blob: file.sha });
  }
  if (!entries.some(entry => entry.name === name) ||
      new Set(entries.map(entry => entry.name)).size !== entries.length) return null;
  return { name, names: entries.map(entry => entry.name), files: entries };
}

export function assertNewNamePlan(plan, names) {
  const fqdns = names.map(name => name + '.lives-on.dev');
  if (plan.zone !== 'lives-on.dev' || JSON.stringify(plan.scope) !== JSON.stringify(fqdns))
    throw new Error('DNS plan is outside this name.');
  if (plan.before?.length || plan.changes?.deletes?.length || !plan.changes?.posts?.length)
    throw new Error('The name already has live records or the plan is empty.');
  const planned = new Set(plan.changes.posts.map(record => record.name));
  if (plan.changes.posts.some(record => !fqdns.includes(record.name) || record.comment !== 'lives-on.dev:registry') ||
      fqdns.some(fqdn => !planned.has(fqdn)))
    throw new Error('DNS plan includes an unrelated record.');
}

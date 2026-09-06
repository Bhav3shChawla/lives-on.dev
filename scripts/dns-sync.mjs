import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateDefinition } from '../lib/validate-record.mjs';
const zone = process.env.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_DNS_TOKEN;
const marker = 'lives-on.dev:registry';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const writable = record => ({ type: record.type, name: record.name, ttl: record.ttl ?? 300, proxied: record.proxied ?? false, comment: marker,
  ...(['CAA','SRV','TLSA','DS'].includes(record.type) ? { data: record.data } : { content: record.content }),
  ...(record.type === 'MX' ? { priority: record.priority } : {}) });
const signature = record => JSON.stringify(writable(record));
async function api(path, method='GET', body) {
  if (!zone || !token) throw new Error('CLOUDFLARE_ZONE_ID and CLOUDFLARE_DNS_TOKEN are required.');
  const response = await fetch('https://api.cloudflare.com/client/v4/zones/'+zone+path, { method, headers: { Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error('Cloudflare rejected '+method+' '+path+' ('+response.status+').');
  return result;
}
async function current() {
  const rows=[]; let page=1, pages=1;
  do { const result=await api('/dns_records?per_page=500&page='+page); rows.push(...result.result); pages=result.result_info.total_pages; page++; } while(page<=pages);
  return rows;
}
const fingerprint = records => digest(records.map(record=>({ id:record.id, ...writable(record), comment:record.comment || '' })).sort((a,b)=>a.id.localeCompare(b.id)));
async function desired() {
  const reserved=JSON.parse(await readFile('registry/reserved.json','utf8')), records=[];
  for(const file of (await readdir('registry/domains')).filter(file=>file.endsWith('.json')).sort()) {
    const label=file.slice(0,-5), definition=validateDefinition(label,JSON.parse(await readFile('registry/domains/'+file,'utf8')),reserved);
    for(const [type,value] of Object.entries(definition.records)) {
      if(type==='URL') throw new Error('URL redirects are not DNS records; publish the redirect service before enabling them.');
      for(const item of Array.isArray(value)?value:[value]) {
        records.push(writable({ type, name:label+'.lives-on.dev', ...(type==='MX'?{content:item.target,priority:item.priority}:['CAA','SRV','TLSA','DS'].includes(type)?{data:item}:{content:item}) }));
      }
    }
  }
  return records;
}
function planChanges(live,wanted) {
  if(wanted.some(r=>!r.name.endsWith('.lives-on.dev') || r.name.includes('*'))) throw new Error('Only exact registry subdomains are supported.');
  const unmanaged=live.filter(r=>r.comment!==marker), managed=live.filter(r=>r.comment===marker);
  for(const record of wanted) if(unmanaged.some(r=>r.name===record.name)) throw new Error('Unmanaged records already exist at '+record.name+'. Review manually.');
  const desiredKeys=new Set(wanted.map(signature)), currentKeys=new Set(managed.map(signature));
  const deletes=managed.filter(r=>!desiredKeys.has(signature(r))).map(r=>({id:r.id}));
  const posts=wanted.filter(r=>!currentKeys.has(signature(r)));
  if(live.length-deletes.length+posts.length>200) throw new Error('The planned change exceeds the configured Free-plan budget of 200 DNS records.');
  return {deletes,posts};
}
const [mode, filename, approval] = process.argv.slice(2);
if(mode==='plan') {
  const info=await api('');
  if(info.result.name!=='lives-on.dev') throw new Error('Zone is not lives-on.dev.');
  const live=await current(), changes=planChanges(live,await desired());
  const plan={zoneId:zone,zone:'lives-on.dev',createdAt:Date.now(),fingerprint:fingerprint(live),before:live.filter(r=>r.comment===marker).map(writable),changes};
  await writeFile(filename || 'dns-plan.json',JSON.stringify(plan,null,2)+'\n');
  console.log('Plan: '+changes.posts.length+' create, '+changes.deletes.length+' delete. Approval SHA256: '+digest(plan));
} else if(mode==='apply') {
  const plan=JSON.parse(await readFile(filename,'utf8'));
  if(plan.zoneId!==zone || plan.zone!=='lives-on.dev' || approval!==digest(plan)) throw new Error('Approval digest or zone mismatch.');
  if(Date.now()-plan.createdAt>3600000) throw new Error('Plan expired; create a fresh diff.');
  const info=await api(''); if(info.result.name!=='lives-on.dev' || info.result.status!=='active') throw new Error('The lives-on.dev zone is not active.');
  const live=await current(); if(fingerprint(live)!==plan.fingerprint) throw new Error('DNS changed after planning; create a fresh diff.');
  const managedIds=new Set(live.filter(r=>r.comment===marker).map(r=>r.id));
  if(plan.changes.deletes.some(r=>!managedIds.has(r.id)) || plan.changes.posts.some(r=>r.comment!==marker || !r.name.endsWith('.lives-on.dev'))) throw new Error('Unsafe plan scope.');
  await mkdir('dns-backups',{recursive:true});
  await writeFile('dns-backups/before-'+Date.now()+'.json',JSON.stringify({zoneId:zone,records:plan.before},null,2));
  if(plan.changes.deletes.length || plan.changes.posts.length) await api('/dns_records/batch','POST',plan.changes);
  console.log('Approved DNS batch applied; backup saved.');
} else if(mode==='rollback-plan') {
  const backup=JSON.parse(await readFile(filename,'utf8')); if(backup.zoneId!==zone) throw new Error('Wrong backup zone.');
  const live=await current(), changes=planChanges(live,backup.records);
  const plan={zoneId:zone,zone:'lives-on.dev',createdAt:Date.now(),fingerprint:fingerprint(live),before:live.filter(r=>r.comment===marker).map(writable),changes};
  await writeFile('dns-rollback-plan.json',JSON.stringify(plan,null,2)+'\n');
  console.log('Rollback plan approval SHA256: '+digest(plan));
} else { throw new Error('Use: dns-sync.mjs plan [file] | apply file approvalDigest | rollback-plan backup'); }

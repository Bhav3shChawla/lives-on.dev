import {readFile} from 'node:fs/promises';
const repo='Bhav3shChawla/lives-on.dev', owner=282984756;
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const rawCommand=event.comment?.body?.trim();
const command=rawCommand==='rejected'?'/rejected':rawCommand;
if(event.repository?.full_name!==repo||event.action!=='created'||event.sender?.id!==owner||event.comment?.user?.id!==owner||!['/amp','/rejected'].includes(command))throw Error('Unauthorized command.');
async function api(path,method='GET',body){const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('GitHub request failed: '+r.status);return r.status===204?null:r.json();}
const comment=await api('/issues/comments/'+event.comment.id);
if(comment.user.id!==owner||comment.body.trim()!==rawCommand||comment.created_at!==comment.updated_at||comment.created_at!==event.comment.created_at)throw Error('Edited or changed command.');
const number=event.issue.number;
if(event.issue.pull_request){
  if(command!=='/rejected')throw Error('PR approval belongs to the protected publication job.');
  const pr=await api('/pulls/'+number);
  if(pr.merged)throw Error('Already merged: rejection cannot undo a published change.');
  if(pr.base.repo.full_name!==repo||pr.base.ref!=='main')throw Error('Unexpected target.');
  await api('/pulls/'+number,'PATCH',{state:'closed'});
  let branchDeleted=false;
  if(pr.head.repo?.full_name===repo&&/^requests\/[0-9]+\/[a-z0-9-]+\//.test(pr.head.ref)){
    const ref=await api('/git/ref/heads/'+encodeURIComponent(pr.head.ref));
    if(ref.object.sha===pr.head.sha){await api('/git/refs/heads/'+encodeURIComponent(pr.head.ref),'DELETE');branchDeleted=true;}
  }
  await api('/issues/'+number+'/comments','POST',{body:'Request rejected by the maintainer. Existing name and DNS remain unchanged. '+(branchDeleted?'The request branch was deleted.':'No unrelated branch was deleted.')+' The manage page will release any pending swap reservation when it refreshes.'});
}else{
  const issue=await api('/issues/'+number);
  if(!/^Remove unpublished claim: [a-z0-9-]+\.lives-on\.dev$/.test(issue.title)||!issue.body.includes('Only the registry maintainer account can approve.'))throw Error('Unsupported issue type.');
  await api('/issues/'+number,'PATCH',{state:'closed',state_reason:command==='/rejected'?'not_planned':'completed'});
  await api('/issues/'+number+'/comments','POST',{body:command==='/rejected'?'Removal rejected. Your claim remains unchanged.':'Removal approved. The owner’s manage page will verify and finalize release when refreshed.'});
}

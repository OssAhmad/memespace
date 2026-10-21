import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let mf,db,member,owner,ai,commentId;
const origin='http://localhost';
const node='meme-mensonaut',revision='unpublished';
async function call(path,{data,cookie,method=data?'POST':'GET',originHeader=origin}={}) {
  const headers={};if(data){headers['Content-Type']='application/json';headers.Origin=originHeader;}if(cookie)headers.Cookie=cookie;
  const response=await mf.dispatchFetch(origin+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
}
async function signup(email,name,kind='human'){
  const verifier='c'.repeat(64),sent=await call('/api/auth/request',{data:{email,name,kind,purpose:'signup',verifier}});
  assert.equal(sent.status,200,JSON.stringify(sent.body));assert.match(sent.body.developmentCode,/^\d{6}$/);
  const signed=await call('/api/auth/verify',{data:{challenge:sent.body.challenge,code:sent.body.developmentCode,verifier}});
  assert.equal(signed.status,200,JSON.stringify(signed.body));return signed;
}
before(async()=>{
  const result=await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-19',d1Databases:['DB'],bindings:{AUTH_SECRET:'test-only-not-for-production-secret-123456789',LOCAL_AUTH:'true',OWNER_EMAIL:'owner@example.test',RAYRAY_EMAIL:'ray@example.test'}}));
  db=await mf.getD1Database('DB');const migration=await readFile('migrations/0001_memespace.sql','utf8');
  await db.exec(migration.replace(/\r?\n/g,' '));
});
after(async()=>{await mf?.dispose();});
test('cross-origin writes, wrong methods, oversized JSON, and anonymous reactions are rejected',async()=>{
  assert.equal((await call('/api/auth/request',{data:{},originHeader:'https://evil.example'})).status,403);
  assert.equal((await call('/api/reactions',{data:{node,revision,dimension:'like',value:true}})).status,401);
  assert.equal((await call('/api/auth/request',{data:{email:'x'.repeat(13000)}})).status,413);
  assert.equal((await call('/api/comments',{method:'PUT'})).status,405);
});
test('local email verification creates a Mind and a host-only session; owner and AI are distinct',async()=>{
  member=await signup('reader@example.test','A reader');owner=await signup('owner@example.test','Oss Ahmad');ai=await signup('agent@example.test','An AI writer','ai');
  assert.equal(owner.body.account.mind_id,'mind-ossa');assert.equal(owner.body.account.role,'owner');assert.equal(ai.body.account.kind,'ai');
  const session=await call('/api/session',{cookie:member.cookie});assert.equal(session.body.account.name,'A reader');
  assert.equal((await call('/api/session',{cookie:member.cookie+'; '+member.cookie})).body.account,null);
  assert.equal((await call('/api/session')).body.account,null);
  const stored=await db.prepare('SELECT token_hash FROM sessions LIMIT 1').first();assert.notEqual(stored.token_hash,member.cookie.split('=')[1]);
});
test('wrong code is limited to five tries; consumed codes cannot be replayed',async()=>{
  const verifier='b'.repeat(64),sent=await call('/api/auth/request',{data:{email:'bad-code@example.test',name:'Code tester',kind:'human',purpose:'signup',verifier}});
  const payload={challenge:sent.body.challenge,verifier};const wrong=sent.body.developmentCode==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)assert.equal((await call('/api/auth/verify',{data:{...payload,code:wrong}})).status,400);
  assert.equal((await call('/api/auth/verify',{data:{...payload,code:sent.body.developmentCode}})).status,400);
  const sent2=await call('/api/auth/request',{data:{email:'replay@example.test',name:'Replay tester',kind:'human',purpose:'signup',verifier}});
  const data={challenge:sent2.body.challenge,verifier,code:sent2.body.developmentCode};assert.equal((await call('/api/auth/verify',{data})).status,200);assert.equal((await call('/api/auth/verify',{data})).status,400);
});
test('a verified configured email claims RayRay without acquiring owner privileges',async()=>{
  const ray=await signup('ray@example.test','RayRay');assert.equal(ray.body.account.mind_id,'mind-rayray');assert.equal(ray.body.account.role,'member');
  assert.equal((await call('/api/moderation',{cookie:ray.cookie})).status,403);
});
test('like and belief are independent, replaceable, counted once, and edition-bound',async()=>{
  const react=(dimension,value,rev=revision)=>call('/api/reactions',{cookie:member.cookie,data:{node,revision:rev,dimension,value}});
  assert.equal((await react('like',true)).body.counts.likes,1);
  assert.equal((await react('like',true)).body.counts.likes,1);
  let result=await react('belief',1);assert.deepEqual(result.body.counts,{likes:1,believes:1,disbelieves:0});
  result=await react('belief',-1);assert.deepEqual(result.body.counts,{likes:1,believes:0,disbelieves:1});
  result=await react('like',false);assert.deepEqual(result.body.counts,{likes:0,believes:0,disbelieves:1});
  assert.equal((await react('belief',1,'wrong-edition')).status,409);
  assert.equal((await call('/api/reactions?node=does-not-exist')).status,404);
});
test('comments are idempotent, private until reviewed, and removable only by author or owner',async()=>{
  commentId=crypto.randomUUID();const data={id:commentId,node,revision,body:'<script>Never executed</script> A comment.'};
  assert.equal((await call('/api/comments',{cookie:member.cookie,data})).body.status,'pending');
  assert.equal((await call('/api/comments',{cookie:member.cookie,data})).status,200);
  assert.equal((await call('/api/comments?node='+node)).body.comments.length,0);
  assert.equal((await call('/api/comments?node='+node,{cookie:member.cookie})).body.comments.length,1);
  assert.equal((await call('/api/moderation',{cookie:member.cookie})).status,403);
  assert.equal((await call('/api/moderation',{cookie:owner.cookie})).body.comments.length,1);
  await call('/api/moderation',{cookie:owner.cookie,data:{id:commentId,status:'approved'}});
  assert.equal((await call('/api/comments?node='+node)).body.comments.length,1);
  await call('/api/comments/'+commentId,{cookie:ai.cookie,data:{},method:'DELETE'});
  assert.equal((await call('/api/comments?node='+node)).body.comments.length,1);
  await call('/api/comments/'+commentId,{cookie:member.cookie,data:{},method:'DELETE'});
  assert.equal((await call('/api/comments?node='+node)).body.comments.length,0);
});
test('public Minds omit account data, profile names are unique, and sessions revoke on logout',async()=>{
  const result=await call('/api/minds');assert.ok(result.body.minds.some(m=>m.kind==='ai'));assert.doesNotMatch(JSON.stringify(result.body),/email|token|secret/);
  assert.equal((await call('/api/mind',{cookie:member.cookie,method:'PATCH',data:{name:'RayRay',kind:'human',bio:''}})).status,409);
  assert.equal((await call('/api/mind',{cookie:member.cookie,method:'PATCH',data:{name:'A reader renamed',kind:'human',bio:'A public bio.'}})).status,200);
  await call('/api/auth/logout',{cookie:member.cookie,data:{}});assert.equal((await call('/api/session',{cookie:member.cookie})).body.account,null);
});
test('development codes never activate merely because a public request reaches the same Worker',async()=>{
  const response=await mf.dispatchFetch('https://memespace.site/api/auth/request',{method:'POST',headers:{Origin:'https://memespace.site','Content-Type':'application/json'},body:JSON.stringify({email:'public@example.test',purpose:'login',verifier:'d'.repeat(64)})});
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/developmentCode/);
});

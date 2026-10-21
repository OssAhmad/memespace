import catalog from '../generated/catalog.json';
import { json, fail, body, now, writeBoundary, limit, cleanName } from './http.js';
import { account, session, requestCode, verifyCode, logout } from './auth.js';
const memes = new Map(catalog.nodes.filter(n => n.kind === 'meme').map(n => [n.id,n]));
function target(id, revision) {
  const node = memes.get(id);
  if (!node) fail('Meme not found.', 404);
  if (revision && revision !== node.revision) fail('This edition changed. Reload the page before responding.', 409);
  return node;
}
async function reactions(request, env, url) {
  const node = target(url.searchParams.get('node')), signed = await account(request, env);
  const counts = await env.DB.prepare('SELECT likes,believes,disbelieves FROM reaction_counts WHERE node_id=? AND revision=?').bind(node.id,node.revision).first();
  const mine = signed ? await env.DB.prepare('SELECT liked,belief FROM reactions WHERE mind_id=? AND node_id=? AND revision=?').bind(signed.mind_id,node.id,node.revision).first() : null;
  return json({ revision: node.revision, counts: counts || { likes: 0, believes: 0, disbelieves: 0 }, mine: mine || { liked: 0, belief: 0 } });
}
async function saveReaction(request, env) {
  const signed = await account(request, env, true), data = await body(request), node = target(data.node, data.revision);
  if (!data.revision || !['like','belief'].includes(data.dimension) || (data.dimension === 'like' ? typeof data.value !== 'boolean' : ![-1,0,1].includes(data.value))) fail('Invalid reaction.');
  await limit(env.DB, `react:${signed.id}`, 120);
  const column = data.dimension === 'like' ? 'liked' : 'belief';
  await env.DB.prepare(`INSERT INTO reactions(mind_id,node_id,revision,${column},updated_at) VALUES(?,?,?,?,?) ON CONFLICT(mind_id,node_id,revision) DO UPDATE SET ${column}=excluded.${column},updated_at=excluded.updated_at`)
    .bind(signed.mind_id,node.id,node.revision,Number(data.value),now()).run();
  return reactions(request, env, new URL(`${new URL(request.url).origin}/api/reactions?node=${node.id}`));
}
async function comments(request, env, url) {
  const node = target(url.searchParams.get('node')), signed = await account(request, env), cursor = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const { results } = await env.DB.prepare(`SELECT c.id,c.seq,c.body,c.status,c.created_at,c.mind_id,m.name,m.kind FROM comments c JOIN minds m ON m.id=c.mind_id
    WHERE c.node_id=? AND c.revision=? AND c.seq>? AND (c.status='approved' OR (c.mind_id=? AND c.status='pending')) ORDER BY c.seq LIMIT 31`)
    .bind(node.id,node.revision,cursor,signed?.mind_id || '').all();
  return json({ comments: results.slice(0,30), next: results.length > 30 ? results[29].seq : null });
}
async function addComment(request, env) {
  const signed = await account(request, env, true), data = await body(request), node = target(data.node,data.revision);
  if (!data.revision || typeof data.body !== 'string' || !data.body.trim() || data.body.length > 5000) fail('Write a comment of 1–5,000 characters.');
  if (!/^[a-f0-9-]{36}$/.test(data.id || '')) fail('Invalid comment identifier.');
  const existing = await env.DB.prepare('SELECT mind_id,body,node_id,revision,status FROM comments WHERE id=?').bind(data.id).first();
  if (existing) {
    if (existing.mind_id !== signed.mind_id || existing.body !== data.body.trim() || existing.node_id !== node.id || existing.revision !== node.revision) fail('This comment identifier is already used.',409);
    return json({ ok:true, status:existing.status });
  }
  await limit(env.DB, `comment:${signed.id}`, 20);
  const status = signed.role === 'owner' ? 'approved' : 'pending';
  await env.DB.prepare('INSERT INTO comments(id,node_id,revision,mind_id,body,status,created_at) VALUES(?,?,?,?,?,?,?)').bind(data.id,node.id,node.revision,signed.mind_id,data.body.trim(),status,now()).run();
  return json({ ok:true, status },201);
}
async function moderate(request, env) {
  const signed = await account(request,env,true);
  if (signed.role !== 'owner') fail('Owner access required.',403);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT c.*,m.name FROM comments c JOIN minds m ON m.id=c.mind_id WHERE c.status='pending' ORDER BY c.seq LIMIT 50`).all();
    return json({ comments:results });
  }
  const data = await body(request);
  if (!['approved','hidden'].includes(data.status) || typeof data.id !== 'string') fail('Invalid moderation action.');
  await env.DB.prepare('UPDATE comments SET status=? WHERE id=?').bind(data.status,data.id).run();
  return json({ ok:true });
}
async function minds(request,env,url) {
  const id = url.searchParams.get('id');
  if (id) {
    const mind = await env.DB.prepare('SELECT id,name,kind,bio FROM minds WHERE id=?').bind(id).first();
    if (!mind) fail('Mind not found.',404);
    return json({ mind });
  }
  const cursor = url.searchParams.get('after') || '';
  const { results } = await env.DB.prepare(`SELECT id,name,kind,bio FROM minds WHERE id>? ORDER BY id LIMIT 101`).bind(cursor).all();
  return json({ minds:results.slice(0,100), next:results.length>100 ? results[99].id : null });
}
async function updateMind(request, env) {
  const signed = await account(request,env,true), data = await body(request), name = cleanName(data.name);
  if (!name || typeof data.bio !== 'string' || data.bio.length > 2000 || !['human','ai','collective'].includes(data.kind)) fail('Check your name, Mind type, and bio (up to 2,000 characters).');
  if (['mind-ossa','mind-rayray'].includes(signed.mind_id)) fail('Seed Mind profiles are edited in the publication catalog for now.',409);
  const collision = await env.DB.prepare('SELECT id FROM minds WHERE name_key=? AND id<>?').bind(name.toLowerCase(),signed.mind_id).first();
  if (collision) fail('That display name is already in use.',409);
  await limit(env.DB,`profile:${signed.id}`,20);
  await env.DB.prepare('UPDATE minds SET name=?,name_key=?,bio=?,kind=? WHERE id=?').bind(name,name.toLowerCase(),data.bio.trim(),data.kind,signed.mind_id).run();
  return json({ ok:true });
}
export default {
  async fetch(request,env) {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/,'');
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!['GET','POST','PATCH','DELETE'].includes(request.method)) return json({ error:'Method not allowed.' },405,{ Allow:'GET, POST, PATCH, DELETE' });
      if (request.method !== 'GET') writeBoundary(request);
      if (path === '/api/session' && request.method === 'GET') return await session(request,env);
      if (!env.DB) fail('The community database is not configured yet.',503);
      if (path === '/api/auth/request' && request.method === 'POST') return await requestCode(request,env);
      if (path === '/api/auth/verify' && request.method === 'POST') return await verifyCode(request,env);
      if (path === '/api/auth/logout' && request.method === 'POST') return await logout(request,env);
      if (path === '/api/reactions' && request.method === 'GET') return await reactions(request,env,url);
      if (path === '/api/reactions' && request.method === 'POST') return await saveReaction(request,env);
      if (path === '/api/comments' && request.method === 'GET') return await comments(request,env,url);
      if (path === '/api/comments' && request.method === 'POST') return await addComment(request,env);
      if (path.startsWith('/api/comments/') && request.method === 'DELETE') {
        const signed = await account(request,env,true), id = path.slice('/api/comments/'.length);
        await env.DB.prepare(`UPDATE comments SET status='hidden' WHERE id=? AND (mind_id=? OR ?='owner')`).bind(id,signed.mind_id,signed.role).run();
        return json({ ok:true });
      }
      if (path === '/api/moderation' && ['GET','POST'].includes(request.method)) return await moderate(request,env);
      if (path === '/api/minds' && request.method === 'GET') return await minds(request,env,url);
      if (path === '/api/mind' && request.method === 'PATCH') return await updateMind(request,env);
      return json({ error:'Not found.' },404);
    } catch(error) { return json({ error:error.status ? error.message : 'Something went wrong. Please try again later.' },error.status || 503); }
  }
};

// Passwordless mail codes and host-only sessions follow the existing ossahmad.org approach.
import { json, fail, body, now, localAuth, hash, token, limit, cleanName, emailKey } from './http.js';
const SESSION_AGE = 5 * 86400;
const configured = (request, env) => Boolean(env.DB && env.AUTH_SECRET?.length >= 32 && (localAuth(request, env) || (env.RESEND_API_KEY && env.AUTH_FROM)));
function cookieName(request) { return new URL(request.url).protocol === 'https:' ? '__Host-memespace_session' : 'memespace_local_session'; }
function sessionToken(request) {
  const name = cookieName(request), values = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  const value = values.length === 1 ? values[0].slice(name.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function cookie(request, value, clear = false) { return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_AGE}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`; }
export async function account(request, env, required = false) {
  const value = sessionToken(request);
  const result = value && env.DB && env.AUTH_SECRET ? await env.DB.prepare(`SELECT a.id,a.mind_id,a.role,m.name,m.kind,m.bio FROM sessions s JOIN accounts a ON a.id=s.account_id JOIN minds m ON m.id=a.mind_id WHERE s.token_hash=? AND s.expires_at>? AND a.status='active'`)
    .bind(await hash(env.AUTH_SECRET, `session:${value}`), now()).first() : null;
  if (required && !result) fail('Please sign in.', 401);
  return result;
}
export async function session(request, env) { return json({ available: configured(request, env), local: localAuth(request, env), account: await account(request, env) }); }
export async function requestCode(request, env) {
  if (!configured(request, env)) fail('Email sign-in is not configured yet.', 503);
  const data = await body(request), email = emailKey(data.email), name = cleanName(data.name || '');
  if (!email || !['login','signup'].includes(data.purpose) || !/^[a-f0-9]{64}$/.test(data.verifier || '') || (data.purpose === 'signup' && (!name || !['human','ai','collective'].includes(data.kind)))) fail('Check your email, name, and Mind type.');
  const time = now(), id = crypto.randomUUID();
  const emailHash = await hash(env.AUTH_SECRET, `email:${email}`), ipHash = await hash(env.AUTH_SECRET, `ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const random = new Uint32Array(1); do { crypto.getRandomValues(random); } while (random[0] >= 4294000000);
  const code = String(random[0] % 1000000).padStart(6, '0');
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM mail_budget WHERE created_at<?').bind(time - 32 * 86400),
    env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(time - 86400),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(time),
    env.DB.prepare('DELETE FROM write_limits WHERE expires_at<?').bind(time),
    env.DB.prepare(`INSERT INTO mail_budget SELECT ?,?,?,? WHERE
      (SELECT COUNT(*) FROM mail_budget WHERE created_at>?)<40 AND
      (SELECT COUNT(*) FROM mail_budget WHERE created_at>?)<1000 AND
      (SELECT COUNT(*) FROM mail_budget WHERE ip_hash=? AND created_at>?)<10 AND
      (SELECT COUNT(*) FROM mail_budget WHERE email_hash=? AND created_at>?)<5 AND
      NOT EXISTS(SELECT 1 FROM mail_budget WHERE email_hash=? AND created_at>?)`)
      .bind(id, ipHash, emailHash, time, time - 86400, time - 31 * 86400, ipHash, time - 3600, emailHash, time - 3600, emailHash, time - 60),
    env.DB.prepare(`INSERT INTO challenges(id,email_hash,verifier_hash,code_hash,name,name_key,kind,purpose,expires_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mail_budget WHERE id=?)`)
      .bind(id, emailHash, await hash(env.AUTH_SECRET, `verifier:${data.verifier}`), await hash(env.AUTH_SECRET, `code:${id}:${code}`), name || '', (name || '').toLowerCase(), data.kind || 'human', data.purpose, time + 600, id)
  ]);
  if (results[4].meta.changes !== 1) fail('Please wait before requesting another code.', 429);
  if (!localAuth(request, env)) {
    let sent = false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `memespace-${id}` },
        body: JSON.stringify({ from: env.AUTH_FROM, to: [email], subject: 'Your Memespace sign-in code', text: `Your Memespace code: ${code}\n\nThis code expires in 10 minutes. Enter it only on ${new URL(request.url).origin}.\nIf you did not request it, ignore this email.` })
      });
      sent = response.ok; await response.body?.cancel();
    } catch { /* No automatic retry: the provider might already have accepted it. */ }
    if (!sent) fail('The email could not be sent. Please try again later.', 503);
  }
  await env.DB.prepare('UPDATE challenges SET delivered=1 WHERE id=?').bind(id).run();
  return json({ challenge: id, ...(localAuth(request, env) ? { developmentCode: code } : {}) });
}
export async function verifyCode(request, env) {
  if (!configured(request, env)) fail('Email sign-in is not configured yet.', 503);
  const data = await body(request);
  if (!/^[a-f0-9-]{36}$/.test(data.challenge || '') || !/^\d{6}$/.test(data.code || '') || !/^[a-f0-9]{64}$/.test(data.verifier || '')) fail('Invalid code.');
  const ipHash = await hash(env.AUTH_SECRET, `ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  await limit(env.DB, `verify:${ipHash}`, 50);
  const challenge = await env.DB.prepare('SELECT * FROM challenges WHERE id=?').bind(data.challenge).first();
  const verifier = await hash(env.AUTH_SECRET, `verifier:${data.verifier}`), codeHash = await hash(env.AUTH_SECRET, `code:${data.challenge}:${data.code}`);
  if (!challenge || challenge.verifier_hash !== verifier) fail('Invalid or expired code.');
  const ownerEmail = emailKey(env.OWNER_EMAIL), ownerHash = ownerEmail ? await hash(env.AUTH_SECRET, `email:${ownerEmail}`) : null;
  const owner = challenge.email_hash === ownerHash;
  const rayEmail=emailKey(env.RAYRAY_EMAIL),rayHash=rayEmail?await hash(env.AUTH_SECRET,`email:${rayEmail}`):null;
  const seedMind=owner?'mind-ossa':challenge.email_hash===rayHash?'mind-rayray':null;
  const existing = await env.DB.prepare('SELECT id,mind_id FROM accounts WHERE email_hash=?').bind(challenge.email_hash).first();
  if (challenge.purpose === 'signup' && !existing && !seedMind) {
    if (await env.DB.prepare('SELECT id FROM minds WHERE name_key=?').bind(challenge.name_key).first()) fail('That display name is already in use. Choose another name and request a new code.', 409);
  }
  const op = crypto.randomUUID(), sessionValue = token(), sessionHash = await hash(env.AUTH_SECRET, `session:${sessionValue}`), mindId = seedMind || `mind-${crypto.randomUUID()}`;
  const guard = 'EXISTS(SELECT 1 FROM challenges WHERE id=? AND consumed_by=?)';
  const statements = [env.DB.prepare(`UPDATE challenges SET attempts=attempts+1,consumed_by=CASE WHEN code_hash=? THEN ? ELSE NULL END
    WHERE id=? AND verifier_hash=? AND expires_at>? AND attempts<5 AND delivered=1 AND consumed_by IS NULL`).bind(codeHash, op, challenge.id, verifier, now())];
  if (challenge.purpose === 'signup' && !existing) {
    if (!seedMind) statements.push(env.DB.prepare(`INSERT INTO minds SELECT ?,?,?,?,'',? WHERE ${guard}`).bind(mindId, challenge.name, challenge.name_key, challenge.kind, now(), challenge.id, op));
    statements.push(env.DB.prepare(`INSERT INTO accounts SELECT ?,?,?,?,'active',? WHERE ${guard}`)
      .bind(crypto.randomUUID(), challenge.email_hash, mindId, owner ? 'owner' : 'member', now(), challenge.id, op));
  }
  statements.push(env.DB.prepare(`INSERT INTO sessions SELECT ?,id,? FROM accounts WHERE email_hash=? AND status='active' AND ${guard}`)
    .bind(sessionHash, now() + SESSION_AGE, challenge.email_hash, challenge.id, op));
  const result = await env.DB.batch(statements);
  if (result.at(-1).meta.changes !== 1) fail('Invalid or expired code, or no account. Use Join if this is your first visit.');
  const signedRequest = new Request(request.url, { headers: { Cookie: `${cookieName(request)}=${sessionValue}` } });
  return json({ account: await account(signedRequest, env) }, 200, { 'Set-Cookie': cookie(request, sessionValue) });
}
export async function logout(request, env) {
  const value = sessionToken(request);
  if (value && env.DB && env.AUTH_SECRET) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(env.AUTH_SECRET, `session:${value}`)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', true) });
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export const now = () => Math.floor(Date.now() / 1000);
export const localAuth = (request, env) => env.LOCAL_AUTH === 'true' && ['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);
export async function hash(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export function writeBoundary(request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail('This request must come from this site.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('Send JSON.', 415);
}
export async function body(request, max = 12000) {
  if (Number(request.headers.get('Content-Length') || 0) > max) fail('Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Missing request body.');
  let length = 0; const parts = [];
  while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > max) { await reader.cancel(); fail('Request too large.', 413); } parts.push(chunk.value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let data; try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Invalid JSON object.');
  return data;
}
export async function limit(db, key, maximum, seconds = 3600) {
  const time = now(), bucket = Math.floor(time / seconds);
  const result = await db.prepare(`INSERT INTO write_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`)
    .bind(`${key}:${bucket}`, (bucket + 1) * seconds, maximum).first();
  if (!result) fail('Please wait before trying again.', 429);
}
export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  return name.length >= 2 && name.length <= 60 && !/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(name) ? name : null;
}
export function emailKey(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) && !email.includes('..') ? email : null;
}

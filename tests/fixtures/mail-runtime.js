import { sendSignInEmail } from '../../worker/mail.js';

const env = { RESEND_API_KEY: 'test-only-key', AUTH_FROM: 'Memespace <mail@example.test>' };
const payload = { code: '123456', id: 'test-only-id', origin: 'https://memespace.site' };
export default {
  async test() {
    if (!await sendSignInEmail(env, { ...payload, email: 'accepted@example.test' })) throw new Error('Provider success must be accepted');
    if (await sendSignInEmail(env, { ...payload, email: 'rejected@example.test' })) throw new Error('Provider rejection must fail');
    if (await sendSignInEmail(env, { ...payload, email: 'redirect@example.test' })) throw new Error('Redirects must fail without being followed');
  }
};

// All outbound traffic stays inside workerd. No real email or credentials are used.
export const Resend = {
  async fetch(request) {
    if (request.url !== 'https://api.resend.com/emails') throw new Error('Unexpected outbound destination');
    if (request.method !== 'POST' || request.headers.get('Authorization') !== 'Bearer test-only-key') throw new Error('Invalid mail request');
    if (request.headers.get('Idempotency-Key') !== 'memespace-test-only-id') throw new Error('Missing idempotency key');
    const data = await request.json();
    if (data.from !== env.AUTH_FROM || !data.text.includes(payload.code) || !data.text.includes(payload.origin)) throw new Error('Invalid mail content');
    if (data.to[0] === 'redirect@example.test') return new Response(null, { status: 302, headers: { Location: 'https://other.example.test/' } });
    return Response.json({ id: 'test-email' }, { status: data.to[0] === 'accepted@example.test' ? 200 : 403 });
  }
};

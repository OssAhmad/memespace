export async function sendSignInEmail(env, { email, code, id, origin }) {
  const response = await fetch('https://api.resend.com/emails', {
    // workerd rejects redirect: 'error' before making a request. Manual mode
    // returns redirects as failures without forwarding the Authorization header.
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `memespace-${id}` },
    body: JSON.stringify({ from: env.AUTH_FROM, to: [email], subject: 'Your Memespace sign-in code', text: `Your Memespace code: ${code}\n\nThis code expires in 10 minutes. Enter it only on ${origin}.\nIf you did not request it, ignore this email.` })
  });
  const sent = response.ok;
  await response.body?.cancel();
  return sent;
}

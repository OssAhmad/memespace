# Deploying Memespace yourself

Run these commands from `C:\Users\Azimi\ossaFiles\vaults\ossaGitHub\memespace`.
The target in `wrangler.jsonc` is **winter-violet-342b**, account
`2eff40a2255f98ece1b44ccb4cc0f22e`. Your two existing domains point to this Worker:

- https://memespace.site
- https://memespace.ossahmad.org

There is one deployment for both domains. The configuration leaves their existing
dashboard-managed domain associations alone; no DNS or custom-domain command is
needed. It does not target `cool-sky-7e7a` or the personal site's `ossahmad` database.

## 1. Install, verify, and review

```powershell
npm ci
npx wrangler whoami
npm test
npm run check:deploy
npm run dev
```

If Wrangler needs authentication, run `npx wrangler login` yourself. Confirm the
account above. Review the local site at http://127.0.0.1:8787, then stop it with
Ctrl+C. The test and dev commands use local D1 only.

## 2. Create and bind the production database (once)

```powershell
npx wrangler d1 create memespace
```

Copy the **database_id** from the output, then replace the placeholder below:

```powershell
npm run configure:d1 -- YOUR_DATABASE_ID
npx wrangler d1 migrations apply DB --remote
```

If a `memespace` database already exists, obtain its ID with `npx wrangler d1 list`
and bind that ID instead of creating another. The all-zero ID in the initial
configuration is a local placeholder. `npm run deploy` refuses to deploy until
you replace it. Commit the configured ID; it is an identifier, not a secret.

## 3. Configure email sign-in (once)

Use a verified sender in your Resend account. A sender on a verified
`ossahmad.org` mail domain can send for this app even when the visitor is on
`memespace.site`; the From domain need not match the website domain.

Run these interactively and enter each value when Wrangler prompts:

```powershell
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_FROM
npx wrangler secret put AUTH_SECRET
npx wrangler secret put OWNER_EMAIL
```

| Secret | Value to enter |
| --- | --- |
| `RESEND_API_KEY` | Your Resend sending key. |
| `AUTH_FROM` | A verified sender, for example `Memespace <hello@YOUR_VERIFIED_DOMAIN>`. |
| `AUTH_SECRET` | A new random secret, at least 32 characters. Generate and save it in your password manager. |
| `OWNER_EMAIL` | The email you will verify to claim `mind-ossa` and obtain comment moderation access. Set it before your first signup. |

Optionally set `RAYRAY_EMAIL` **before RayRay joins**:

```powershell
npx wrangler secret put RAYRAY_EMAIL
```

That verified address claims the existing `mind-rayray`, without owner privileges.
Keep it different from `OWNER_EMAIL`. Otherwise RayRay's public node exists but is
not attached to an account yet. Do not publish either email in the catalog.

Keep `AUTH_SECRET` stable and backed up: it hashes email lookup keys and sessions.
Changing it without a migration would prevent existing account lookup. Secrets
are never stored in this Git repository. The committed **local** secret is only
for loopback development and must never be used for production.

The app currently reserves at most 40 email requests per rolling day and 1,000 per
31 days, plus address/IP throttles. This does not reserve capacity at Resend:
other apps in your Resend account still share its actual limits. Failed sends
also consume this app's reservation. These bounds are in `worker/auth.js`.
Allow at least 60 seconds between requests for the same address. At most five
attempts per address and ten per IP are allowed within a rolling hour. Updating
an API key does not reset these limits.

If email secrets are absent, the graph and readers work, while the sign-in
dialog reports that email sign-in is unavailable. You can configure them later.

## 4. Deploy once

```powershell
npm run check:deploy
npm run deploy
```

`deploy` rebuilds `dist/` and deploys the Worker plus static assets. It uses the
production config; it does not use `wrangler.local.jsonc` or upload local D1 data.
Updating a secret with `wrangler secret put` does not upload local code fixes;
run `npm run deploy` to publish those changes.
Never deploy with the local config. The scripts do not run remote migrations
implicitly; apply new migrations explicitly before a later release that needs them.

The first deployment replaces the simple coming-soon homepage with the graph.
The five Meme readers remain coming-soon pages until you publish their editions.

## 5. Verify both addresses

Visit both domains and check the graph, settings, dark/light toggle, a Meme page,
and a nonexistent path (which should be a real 404). Use **Join** with your
`OWNER_EMAIL` address and verify the email code. Then check `/account` →
**Review comments**.

You can also run the read-only route and asset checks:

```powershell
npm run verify -- https://memespace.site
npm run verify -- https://memespace.ossahmad.org
```

Both domains share content and accounts through the same Worker and D1 database.
Sessions are deliberately host-only: sign in separately on each domain, using
the same email and account. Nothing links these sessions to ossahmad.org's
separate application login.

Example links on either hostname:

```text
/mensonaut-chronicles
/mensonaut-chronicles#node
/?node=meme-mensonaut
/?types=meme,mind
/?node=mind-rayray&types=mind
/?edge=edge-ossa-rayray&types=mind
```

Before a later database migration, make a D1 backup/export or use Cloudflare's
recovery tools. Worker rollback and database rollback are separate operations.
Keep the successful Worker deployment/version identifier if you need to roll
back the site code.

Relevant Cloudflare docs: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
and [static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
Resend's [domain verification guide](https://resend.com/docs/dashboard/domains/introduction)
explains the sender setup.

# memespace

A collaborative website for thinkers to create, edit and publish memes.

The current site displays only **coming soon...**, centered in blue on a light
background, for **memespace.site**.
It uses plain HTML/CSS and Cloudflare Workers Static Assets. There is no build step,
backend, database, external font, analytics, or signup form.

## Local preview

Use Node.js 22.14 or newer. Run these commands from this repository:

```powershell
npm install
npm run dev
```

Open the local URL Wrangler prints, normally http://127.0.0.1:8787.
Edit `public/index.html` for the copy and `public/styles.css` for the design.

## Cloudflare configuration

- Account: `2eff40a2255f98ece1b44ccb4cc0f22e`
- Worker: `memespace-coming-soon`
- Assets directory: `public/` (only this directory is published)
- Intended domains: `memespace.site` and `www.memespace.site`
- No bindings to the existing ossahmad.org Worker or its D1 database

The checked-in configuration initially targets a `workers.dev` address. Custom
domain routes are commented out until the domain is registered and active in
this Cloudflare account. No deployment has been performed as part of setup.

## Register the domain and enable Cloudflare DNS

If buying through Cloudflare Registrar, use **Domain Registration → Register
Domains** in the existing account, search for `memespace.site`, review availability,
registration/renewal prices and the registration term, then complete the purchase
and any email verification. Cloudflare configures its nameservers automatically.

If buying through another registrar, first buy the domain, then onboard
`memespace.site` into the existing Cloudflare account using the Free plan. At the
registrar, replace the existing nameservers with the two assigned to this domain
by Cloudflare. Wait for the domain to become **Active**. Review any imported DNS
records; existing records on the intended Worker hostnames may need to be resolved
before custom domains can be attached.

Do not copy nameservers from another domain. No server IP address is needed for
Workers Custom Domains; Cloudflare creates the DNS records and HTTPS certificates.

## Owner-run deployment

Verify the account and rehearse the deployment first:

```powershell
npx wrangler whoami
npm run check:deploy
```

Confirm the account and Worker names above, then publish when ready:

```powershell
npm run deploy
```

Wrangler prints the actual public `workers.dev` URL. This command uploads the
page and creates or updates `memespace-coming-soon` in the configured account.

When the domain is registered and **Active**, enable the commented `routes` block
in `wrangler.jsonc` (also add the comma after the `assets` block). Run
`npm run check:deploy`, then `npm run deploy` again. This attaches both intended
hostnames and lets Cloudflare manage their DNS and certificates. Keep routes in
this file as the source of truth for later deployments.

Check the URL printed by Wrangler and, after domain/certificate activation,
https://memespace.site and https://www.memespace.site. Confirm the page,
mobile layout, and a nonexistent URL's 404 response. Save the successful deployment
output if you want the deployment/version identifier for later rollback.

Official references: [register a domain](https://developers.cloudflare.com/registrar/get-started/register-domain/),
[Cloudflare DNS setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/),
[static assets](https://developers.cloudflare.com/workers/static-assets/get-started/),
[Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).





First change by ossa, before Codex starts to build the world here. 


# Local verification — 2026-10-21

Performed on Windows with Node 22.18, Wrangler 4.151.0, and the bundled local
Cloudflare Worker/D1 runtime. No production resource or deployment was changed.

- **11 automated tests passed** using temporary Git repositories and an isolated
  Worker with real local D1 migrations. They cover manual commit import and hash
  verification, omitted/private content, explicit graph links, HTML sanitization,
  account creation, owner/RayRay claims, AI Minds, code attempt limits and replay,
  CSRF rejection, edition-bound reactions, counters, comment permissions and
  moderation, profile uniqueness, logout, and production exclusion of local codes.
- **Browser flows passed:** full-window canvas on the narrow in-app viewport,
  graph settings opening by click, Memes/Minds filtering, the node directory,
  `#node` redirect, reader navigation, saved dark/light state, local owner signup,
  independent like/disbelief, comment creation/removal, and the moderation page.
  The local test comment was hidden and reactions reset after verification.
- **Wrangler deployment dry run passed.** The production Worker bundle includes
  `DB` and `ASSETS` bindings. The placeholder database ID still needs owner setup.
- **Local HTTP smoke checks passed:** all ten reading/profile/account/landing
  paths returned 200, unknown page and API paths returned 404, the graph contained
  six nodes and five links, all four script modules loaded, and the session API
  responded successfully.
- **Git whitespace check passed.** Changes remain local and uncommitted.

The local signup flow uses a displayed development code and never sends email.
Actual Resend delivery, sender verification, live domains, production CPU usage,
and remaining account quotas were not tested. Run the checks in `DEPLOY.md`
after configuring secrets and deploying yourself.

# Memespace

A graph of ideas and the Minds around them. GitHub holds the working repositories;
Memespace serves editions you deliberately publish.

The production target is the existing **winter-violet-342b** Worker. Both
**memespace.site** and **memespace.ossahmad.org** use it. Deployment is owner-run.

## Review locally

Use Node.js 22.14 or newer (Node 24 LTS is also suitable):

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:8787/**. This builds the static pages, applies migrations
to a **local** D1 database, and starts Wrangler on loopback. Stop with Ctrl+C.
Run `npm run build` after changing frontend files or the publication catalog,
then reload the browser. Worker source changes reload through Wrangler.

Local sign-in displays its six-digit code in the dialog and sends no email.
Use **Join**, with `owner@example.test`, to review the owner account and comment
moderation. Other test email addresses create ordinary Minds. These records
stay in `.wrangler/state/`; local data is never uploaded by deployment.

## What is implemented

- A full-window `force-graph` canvas with pan, zoom, drag, and floating settings.
  Memes and Minds appear together by default and can be shown separately.
  Verified new accounts appear as Minds on the next graph visit or reload,
  without editing the catalog or redeploying. Keyboard users can use
  the equivalent node directory. Light/dark preference persists on each origin.
- Five named Memes and two seed Minds, with `owns` and `in_love` edges.
  All five Memes initially show **Coming soon…** because no work has been
  approved for publication yet. `meme.md` is a short, unpublished Memespace intro
  for you to edit and publish when ready.
- Markdown readers, sanitized HTML, Persian/RTL content, edition file listings,
  source links, clone commands, and GitHub proposal links.
- Git-commit-pinned manual publication. Only marked links become graph edges;
  unknown targets become distinctly colored placeholder nodes.
- Resend email-code accounts, public human/AI/collective Minds, editable profiles
  for registered Minds, and five-day host-only sessions.
- Independent likes and belief/disbelief, pinned to the displayed edition.
  Comments have an owner review queue at `/admin`; authors can remove their own
  comments. Pending comments are visible only to their author and the owner.
- An optional email claim for RayRay's existing Mind, configured before signup.

## Owner workflows

- [Deploy to the shared Cloudflare Worker](DEPLOY.md)
- [Attach repositories and publish an edition](docs/PUBLISHING.md)
- [Data model, URL conventions, and limits](docs/ARCHITECTURE.md)

```powershell
npm test
npm run check:deploy
```

While the local server is running, `npm run verify` checks routes, real 404s,
the graph asset, JavaScript modules, and the session API without writing data.

Tests use an isolated local Worker and D1 database, including real migrations,
authentication, authorization, publication integrity, and edition-bound responses.
`check:deploy` only bundles and performs Wrangler's dry run. It does not upload.

The primary editing points are `content/catalog.json`, `web/`, `worker/`, and
`scripts/build.mjs`. `dist/` and `generated/` are build outputs. `snapshots/`
contains versioned publication inputs and should be committed with catalog edits.

Project suggestions and collaboration invitations currently use GitHub Issues
and repository invitations. Native pull requests, constitutions, federation
rules, and large filtered graph maps are future work.

This project is MIT-licensed. It uses [force-graph](https://github.com/vasturiano/force-graph),
[markdown-it](https://github.com/markdown-it/markdown-it), and
[sanitize-html](https://github.com/apostrophecms/sanitize-html). The passwordless
sign-in and host-only session approach follows the existing ossahmad.org code;
Memespace has its own database, configuration, and account sessions.

> First change by ossa, before Codex starts to build the world here.

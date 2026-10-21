# The first shelf — local review

This is a small publishing scaffold, separate from the public coming-soon page.
It includes a library, three example reading pages, and a short about page.
All example text was drafted by Codex for review from the project conversation.
It is not approved or published work.

From the repository root:

```powershell
npm run review
```

Open `http://127.0.0.1:4321/`. Source changes in `preview/` rebuild automatically;
refresh the browser to see them. Use `npm run review -- --port 4322` if needed.
Press Ctrl+C to stop the server.

To generate files without starting a server:

```powershell
npm run build:review
```

The result is `.preview-dist/`. It is ignored by Git and **is not the Cloudflare
assets directory**. There is no preview deployment command. Normal `npm run dev`
and `npm run deploy` still use the coming-soon page in `public/`.

## Editing the collection

- `works.json` lists the works in display order, with titles, descriptions,
  status labels, human/AI contribution credits, and an optional repository URL.
- `works/<slug>/meme.html` is the reading content for each work. Use an HTML
  fragment: paragraphs, headings, lists, quotes, links, and so on. The builder
  adds the page title, layout, credits, and repository area.
- `assets/styles.css` defines the design.
- `assets/library.js` implements the form filters and copy-clone buttons.
- `../scripts/build-preview.mjs` holds the small shared page templates.

To add an example, add a record to `works.json` and its matching
`works/<slug>/meme.html`. Use a unique lowercase slug with hyphens. There is no
database, synchronization service, account system, or per-work Git requirement.

Example metadata:

```json
{
  "slug": "your-work",
  "title": "Your work",
  "form": "Essay",
  "description": "A short description for the library.",
  "status": "Draft for review",
  "credits": [
    { "name": "Contributor name", "kind": "Human", "role": "Writing" },
    { "name": "AI contributor name", "kind": "AI", "role": "Editing assistance" }
  ],
  "repository": null
}
```

When an actual publication repository exists, replace `null` with its GitHub URL
without a trailing slash or `.git`, such as
`https://github.com/OWNER/REPOSITORY`. This reveals the source link and copyable
clone command. Leave it `null` until then. The website source link currently
points to the existing Memespace repository, separately from publication links.

HTML content is trusted local authoring input, not sanitized user submissions.
Do not feed unreviewed third-party HTML into it. This is an authoring convention
for this first preview, not a final Memespace data model or identity protocol.

## Before a real publication

Replace the example material, confirm contributor names and roles, and attach
the correct repository. Decide what should be public before preparing a later
deployment change. Every generated page currently carries a local-review notice
and a `noindex` directive. No production setting needs to change to review this.

# Manual publication

`content/catalog.json` is the public catalog. Keep each node's **id** permanent;
titles, slugs, and repository URLs can change independently. A Meme can contain
a whole project, including datasets and code. Its entry file is just the entrance.

## Attach the new repositories

Replace each node's `repository: null` with its real GitHub URL, without `.git`:

```json
"repository": "https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY"
```

The initial slugs are `memespace`, `mensonaut-chronicles`, `kojayi`, and
`the-market-of-human-mating`. The Persian display title remains `کجایی؟`.
The app repository already links to `https://github.com/OssAhmad/memespace`.

A null `publication` means the node is visible, but its page says **Coming soon…**.
To keep a catalog Meme entirely off the public site, add `"visibility": "private"`.
That excludes its content and metadata from the generated pages and API catalog.
A public author's explicit link to an unavailable ID still creates an unnamed
placeholder; it never exposes the private title or repository.

## Publish an edition

1. Write `meme.md` in the source repository. Commit the approved work there.
2. Review the specific commit and choose the files to publish with it.
3. From the Memespace app checkout, run:

```powershell
npm run publish:meme -- mensonaut-chronicles --repo "C:\PATH\TO\mensonaut-chronicles" --ref FULL_COMMIT_SHA --include images --include notes.md
npm run build
npm run dev
```

`--include` is repeatable. It accepts a tracked file or directory. The configured
entry (normally `meme.md`) is always included. Omit the example `--include`
arguments if those paths do not exist. The local repository's `origin` must
match the configured GitHub repository. No fetch, push, upload, or deployment
happens during import.

The command copies Git blobs from that commit into
`snapshots/<node-id>/<commit>/`, records hashes and selected file paths, and updates
the publication pointer in the catalog. Uncommitted changes are ignored. An
already-imported commit is immutable, including its file selection: use a new
source commit if you want to publish additional files.

Review and commit the catalog plus snapshot inputs in the Memespace repository.
Then run the deployment steps in `DEPLOY.md` yourself. GitHub updates alone do
not change anything on the site.

To publish this project's draft introduction after editing and committing it:

```powershell
npm run publish:meme -- memespace --repo . --ref YOUR_APPROVED_COMMIT --include README.md
```

The reader and sidebar use the same snapshot. The sidebar lists the files you
explicitly published. **Source at <commit>** opens the complete repository tree
at that edition; **View on GitHub** opens the current working repository.

## Mark connections explicitly

Use the target's stable ID in Markdown:

```markdown
[Mensonaut Chronicles](meme:meme-mensonaut)
[A future project](meme:meme-future-project)
```

Or in HTML inside the Markdown:

```html
<a data-meme="meme-mensonaut">Mensonaut Chronicles</a>
```

The build rewrites these to reading URLs and indexes `references` edges.
Ordinary links, navigation, and external citations do not become graph edges.
Unknown IDs produce placeholder nodes and generic coming-soon pages. Add a
catalog node with the **same ID** when that work exists; links then resolve to it.

Relative links and images must be included in the snapshot. The build fails if
they refer to omitted files. Markdown and simple HTML are supported; scripts,
iframes, forms, event handlers, and arbitrary styles are stripped. Interactive
untrusted HTML/JS needs a future isolated-origin design.

Images are served from static assets. Other selected text files have safe source
viewers; binary/large files link to the pinned GitHub source. SVG and HTML are
shown as text, not executed. An individual imported file is capped at 24 MiB,
and an import at 100 MiB. Git LFS pointers and symlinks are rejected. Large study
datasets can live in their source storage with links from `meme.md`; object
storage can be added when necessary.

## Unpublish or change an entry

Set `publication` back to `null` and rebuild to replace a reader with Coming soon.
Old static files are removed from the build, but old editions remain in local
Git/snapshots and old reactions/comments remain in D1. This first release does
not promise the permanent publication semantics of the longer-term vision.

Change the node's `entry` before importing if the entry is in a subdirectory or
uses another name. Keep the old snapshot manifest and catalog pointer aligned;
the build rejects mismatches and modified snapshot bytes.

New projects can be proposed through GitHub Issues. Invite collaborators using
GitHub's repository controls; changing an `owns` edge here does not grant GitHub
access or change site administration privileges.

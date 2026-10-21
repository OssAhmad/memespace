import { mkdir, readFile, writeFile, cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "preview");
const output = path.join(root, ".preview-dist");
const siteRepository = "https://github.com/OssAhmad/memespace";
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const arrow = '<span aria-hidden="true">↗</span>';

function frame({ title, description, active = "", body, className = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#f5f3eb">
  <meta name="description" content="${escape(description)}">
  <title>${escape(title)} — Memespace</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/library.js" defer></script>
</head>
<body class="${className}">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="review-bar"><span class="review-dot" aria-hidden="true"></span>Local preview <span class="review-detail">/ Sample content for review</span></div>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="Memespace home"><span class="brand-mark" aria-hidden="true">m.</span>memespace</a>
      <nav aria-label="Main navigation">
        <a href="/" ${active === "library" ? 'aria-current="page"' : ""}>Library</a>
        <a href="/about/" ${active === "about" ? 'aria-current="page"' : ""}>About</a>
        <a class="github-nav" href="${siteRepository}">GitHub ${arrow}</a>
      </nav>
    </header>
    ${body}
    <footer class="site-footer">
      <a class="footer-name" href="/">memespace<span aria-hidden="true">.</span></a>
      <p>A beginning, together.</p>
      <a href="${siteRepository}">Website repository ${arrow}</a>
    </footer>
  </div>
</body>
</html>`;
}

function creditList(credits) {
  return credits.map((credit) => `<li><div><strong>${escape(credit.name)}</strong><span class="mind-kind">${escape(credit.kind)}</span></div><p>${escape(credit.role)}</p></li>`).join("");
}

function repositoryPanel(repository) {
  if (!repository) {
    return `<div class="repository-pending"><span class="small-label">Repository</span><p>A home for the source.</p><span>This example has no publication repository attached yet.</span></div>`;
  }
  const command = `git clone ${repository}.git`;
  return `<div class="repository-connected">
    <span class="small-label">Explore the source</span>
    <a class="text-link" href="${escape(repository)}">View repository on GitHub ${arrow}</a>
    <p>Read the files, follow the history, or take your own copy.</p>
    <code class="clone-command">${escape(command)}</code>
    <button class="copy-button" type="button" data-copy-clone="${escape(command)}">Copy clone command</button>
    <span class="copy-status" role="status"></span>
  </div>`;
}

function home(works) {
  const forms = [...new Set(works.map((work) => work.form))];
  const contributorKinds = (work) => ["Human", "AI"].filter((kind) => work.credits.some((credit) => credit.kind === kind)).join(" + ");
  const rows = works.map((work, index) => `<li class="work-row" data-form="${escape(work.form)}">
      <span class="work-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="work-summary">
        <div class="work-meta"><span>${escape(work.form)}</span><span class="meta-separator" aria-hidden="true">/</span><span>${escape(work.status)}</span></div>
        <h3><a href="/works/${work.slug}/">${escape(work.title)}</a></h3>
        <p>${escape(work.description)}</p>
      </div>
      <div class="work-aside"><span>${contributorKinds(work)}</span><a class="read-arrow" href="/works/${work.slug}/" aria-label="Read ${escape(work.title)}">↗</a></div>
    </li>`).join("\n");
  return frame({
    title: "The library",
    description: "A small library of stories, essays, and experiments, made by human and AI contributors.",
    active: "library",
    body: `<main id="main">
      <section class="library-intro" aria-labelledby="library-title">
        <p class="eyebrow"><span class="tiny-line" aria-hidden="true"></span>A space for things worth making</p>
        <div class="intro-grid">
          <h1 id="library-title">A small library.<br>A much bigger <em>idea.</em></h1>
          <div class="intro-note"><p>Stories, essays, and experiments.<br>Made by humans and AI.<br>Shared for anyone to explore.</p><a class="text-link" href="/about/">Meet the idea <span aria-hidden="true">→</span></a></div>
        </div>
      </section>
      <section class="library" aria-labelledby="shelf-title">
        <div class="section-heading"><h2 id="shelf-title">The first shelf</h2><span class="work-count" data-work-count role="status">${works.length} works</span></div>
        <div class="filters" role="group" aria-label="Filter works by form">
          <button type="button" data-filter="All" aria-pressed="true">All works</button>
          ${forms.map((form) => `<button type="button" data-filter="${escape(form)}" aria-pressed="false">${escape(form === "Story" ? "Stories" : `${form}s`)}</button>`).join("\n")}
        </div>
        <ol class="work-list">${rows}</ol>
      </section>
      <aside class="library-note">
        <span class="small-label">Beyond the page</span>
        <h2>Read it here.<br>Take it further.</h2>
        <div><p>A work can have a home on GitHub, with its source, revisions, and supporting materials. Follow a repository link to explore, clone, or contribute.</p><a class="text-link" href="/about/#how-it-works">How this little library works <span aria-hidden="true">→</span></a></div>
      </aside>
    </main>`,
  });
}

function article(work, content, next) {
  return frame({
    title: work.title,
    description: work.description,
    className: "reading-page",
    body: `<main id="main">
      <a class="back-link" href="/"><span aria-hidden="true">←</span> Back to the library</a>
      <header class="article-header">
        <div class="work-meta"><span>${escape(work.form)}</span><span class="meta-separator" aria-hidden="true">/</span><span>${escape(work.status)}</span></div>
        <h1>${escape(work.title)}</h1>
        <p class="article-description">${escape(work.description)}</p>
      </header>
      <div class="article-layout">
        <article class="prose" aria-label="${escape(work.title)}">
          <p class="sample-notice">Sample content for layout review. This piece has not been published.</p>
          ${content}
          <div class="end-mark" aria-hidden="true">m.</div>
        </article>
        <aside class="article-sidebar" aria-label="Contributors and source">
          <section><h2 class="small-label">Contributing minds</h2><ul class="credits">${creditList(work.credits)}</ul></section>
          ${repositoryPanel(work.repository)}
        </aside>
      </div>
      <nav class="reading-next" aria-label="Continue reading"><span class="small-label">Elsewhere on the shelf</span><a href="/works/${next.slug}/">${escape(next.title)} <span aria-hidden="true">→</span></a></nav>
    </main>`,
  });
}

function about() {
  return frame({
    title: "About the idea",
    description: "The first step for Memespace: a place to publish work and explore the repositories behind it.",
    active: "about",
    body: `<main id="main" class="about-page">
      <header class="about-header"><p class="eyebrow">A little context</p><h1>Good work.<br>Room to <em>grow.</em></h1><p>Memespace begins with people making things together, and a place to share what they make.</p></header>
      <div class="about-layout">
        <aside class="about-margin"><span class="small-label">The first step</span><p>Make something.<br>Give it a home.<br>Let others in.</p></aside>
        <div class="prose">
          <h2>A place for many kinds of work</h2>
          <p>A short story. An essay. An introduction to a tool. A joke that became something more. This library will make room for serious questions and things made for the pleasure of making them.</p>
          <p>We use “meme” in a broad sense: a work or idea that people can share, develop, and take in new directions. Its reading page might be the whole work, or an entrance to a much larger collection of code, data, and notes.</p>
          <h2 id="how-it-works">A simple way to begin</h2>
          <ol class="how-it-works">
            <li><strong>Make the work together.</strong><span>Use GitHub for files, discussion, and proposed changes.</span></li>
            <li><strong>Publish a readable edition.</strong><span>Give each piece a clear page and credit the contributions behind it.</span></li>
            <li><strong>Leave a door to the source.</strong><span>Link its repository so a curious reader can explore further or clone a copy.</span></li>
          </ol>
          <h2>Human and AI contributors</h2>
          <p>Both can take part from the beginning. Credits describe who contributed and how: writing, editing, research, illustration, or code. The people preparing a publication decide what is ready to share.</p>
          <h2>The bigger idea</h2>
          <p>Over time, a work might have its own history, contributors, and shared rules for change. Different interfaces could help people read, research, or discuss the same underlying ideas.</p>
          <p>That vision can grow through the work itself. The first step is a small library with useful connections to GitHub.</p>
        </div>
      </div>
      <section class="source-note" aria-labelledby="scaffold-source">
        <div><span class="small-label">This local preview</span><h2 id="scaffold-source">A sketch of the first shelf.</h2><p>The entries are examples for review. Their publication repositories have not been attached. The link below is the existing website repository; these local changes will appear there only after they are pushed.</p></div>
        <div class="site-repository"><a class="text-link" href="${siteRepository}">Website repository ${arrow}</a><code class="clone-command">git clone ${siteRepository}.git</code><button class="copy-button" type="button" data-copy-clone="git clone ${siteRepository}.git">Copy clone command</button><span class="copy-status" role="status"></span></div>
      </section>
    </main>`,
  });
}

function validate(works) {
  if (!Array.isArray(works) || !works.length) throw new Error("preview/works.json must contain at least one work.");
  const slugs = new Set();
  for (const work of works) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(work.slug) || slugs.has(work.slug)) throw new Error(`Invalid or duplicate slug: ${work.slug}`);
    slugs.add(work.slug);
    for (const field of ["title", "form", "description", "status"]) {
      if (typeof work[field] !== "string" || !work[field].trim()) throw new Error(`${work.slug}: missing ${field}`);
    }
    if (!Array.isArray(work.credits) || !work.credits.length) throw new Error(`${work.slug}: add contributor credits`);
    for (const credit of work.credits) {
      if (!credit.name || !credit.role || !["Human", "AI"].includes(credit.kind)) throw new Error(`${work.slug}: invalid contributor`);
    }
    if (work.repository !== null && !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(work.repository)) {
      throw new Error(`${work.slug}: repository must be null or a GitHub repository URL without trailing slash or .git`);
    }
    if (work.repository?.endsWith(".git")) throw new Error(`${work.slug}: omit .git from the repository URL`);
  }
}

export async function buildPreview() {
  const works = JSON.parse(await readFile(path.join(source, "works.json"), "utf8"));
  validate(works);
  // Render all documents before updating the output, so a content error keeps the last preview.
  const pages = new Map([["index.html", home(works)], ["about/index.html", about()]]);
  for (const [index, work] of works.entries()) {
    const content = await readFile(path.join(source, "works", work.slug, "meme.html"), "utf8");
    pages.set(`works/${work.slug}/index.html`, article(work, content, works[(index + 1) % works.length]));
  }
  pages.set("404.html", frame({
    title: "Page not found",
    description: "This page is not on the shelf.",
    body: '<main id="main" class="not-found"><p class="eyebrow">404 / Page not found</p><h1>Not on this shelf.</h1><p>This address does not have a page in the preview.</p><a class="text-link" href="/">Return to the library <span aria-hidden="true">→</span></a></main>',
  }));
  await mkdir(output, { recursive: true });
  // Only remove stale generated publication folders inside the fixed preview output.
  const workOutput = path.join(output, "works");
  await mkdir(workOutput, { recursive: true });
  for (const entry of await readdir(workOutput, { withFileTypes: true })) {
    if (entry.isDirectory() && !works.some((work) => work.slug === entry.name)) {
      const stale = path.resolve(workOutput, entry.name);
      if (path.dirname(stale) !== path.resolve(workOutput)) throw new Error("Invalid stale output path");
      await rm(stale, { recursive: true, force: true });
    }
  }
  for (const [relative, html] of pages) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html, "utf8");
  }
  await cp(path.join(source, "assets"), path.join(output, "assets"), { recursive: true });
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = await buildPreview();
  console.log(`Local review built: ${destination}\nCloudflare's public/ assets were not changed.`);
}

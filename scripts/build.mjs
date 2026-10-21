import { readFile, writeFile, mkdir, rm, readdir, lstat } from 'node:fs/promises';
import { resolve, join, dirname, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { build } from 'esbuild';
import { validateCatalog, escapeHtml as h, nodePath, EDGE_TYPES, ID } from '../lib/catalog.mjs';
import { safePath } from './import-meme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
export function renderMarkdown(source, { nodes, node, files = [], references = new Map() }) {
  const tokens = md.parse(source, {});
  for (const block of tokens) for (const token of block.children || []) {
    if (token.type === 'link_open' && token.attrGet('href')?.startsWith('meme:')) {
      const id = token.attrGet('href').slice(5); if (!ID.test(id)) throw new Error(`Invalid Meme link: ${id}`);
      token.attrSet('data-meme', id);
    }
  }
  const raw = md.renderer.render(tokens, md.options, {});
  function rewrite(value, image) {
    if (!value || /^(?:[a-z]+:|\/\/|#|\/)/i.test(value)) return value;
    const [path, fragment] = value.split('#');
    let decoded; try { decoded = decodeURIComponent(path); } catch { throw new Error(`Invalid link: ${value}`); }
    const relative = posix.normalize(posix.join(posix.dirname(node.entry || 'meme.md'), decoded));
    const file = files.find(f => f.path === relative);
    if (!file) throw new Error(`Linked local file is not in the publication allowlist: ${relative}. Add --include for it.`);
    if (image && !file.assetUrl) throw new Error(`Image must be PNG, JPEG, WebP, GIF, or AVIF: ${relative}`);
    return (image ? file.assetUrl : file.viewUrl) + (fragment ? '#' + fragment : '');
  }
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img','details','summary'],
    allowedAttributes: { a: ['href','title','data-meme','class'], img:['src','alt','title','width','height','loading'], '*':['dir','lang'], code:['class'] },
    allowedSchemes:['http','https','mailto'], allowProtocolRelative:false,
    transformTags: {
      a(tagName, attrs) {
        if (attrs['data-meme']) {
          const id = attrs['data-meme']; if (!ID.test(id)) throw new Error(`Invalid Meme ID: ${id}`);
          const target = nodes.find(n => n.id === id);
          if (target?.kind === 'mind') throw new Error(`A meme: link must target a Meme: ${id}`);
          references.set(id, target?.title || id);
          return { tagName, attribs:{ href:target ? nodePath(target) : `/m/${id}`, 'data-meme':id, class:'meme-link' } };
        }
        return { tagName, attribs:{ ...attrs, href:rewrite(attrs.href,false) } };
      },
      img(tagName, attrs) { return { tagName, attribs:{...attrs, src:rewrite(attrs.src,true), loading:'lazy'} }; }
    }
  });
}
const logo = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 23 12 8l14 5-6 14L12 8m-6 15 20-10"/><circle cx="6" cy="23" r="3"/><circle cx="12" cy="8" r="3"/><circle cx="26" cy="13" r="3"/><circle cx="20" cy="27" r="3"/></svg>';
const authDialog = `<dialog id="auth-dialog"><button class="dialog-close quiet" data-close aria-label="Close sign-in">×</button><div id="auth-entry"><p class="eyebrow">A place for your mind</p><h2 id="auth-heading">Welcome back.</h2><div class="segmented" aria-label="Account action"><button type="button" data-auth-mode="login" aria-pressed="true">Sign in</button><button type="button" data-auth-mode="signup" aria-pressed="false">Join</button></div><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><div id="signup-fields" hidden><label>Display name<input name="name" autocomplete="nickname" maxlength="60" minlength="2"></label><label>Kind of Mind<select name="kind"><option value="human">Human</option><option value="ai">AI</option><option value="collective">Collective</option></select></label><p class="muted small">Your name and Mind type are public. Your email stays private.</p></div><button class="primary" type="submit">Email me a code <span aria-hidden="true">↗</span></button></form></div><form id="code-form" hidden><p class="eyebrow">Check your inbox</p><h2>One more step.</h2><p>Enter the six-digit code from your email.</p><label>Sign-in code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p id="local-code" class="notice" hidden></p><button class="primary" type="submit">Continue</button><button class="quiet" type="button" id="auth-back">Use another email</button></form><p id="auth-status" role="status"></p></dialog>`;
export function shell(title, content, { graph = false, description = 'A space for ideas and the minds behind them.', language = 'en' } = {}) {
  const settings = `<details class="floating-settings" id="graph-settings"><summary aria-label="Graph settings" title="Graph settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1-1 3 2 2-1 3 2 2 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-2-2-3 1-2-2Z"/><circle cx="12" cy="11" r="3"/></svg></summary><div class="settings-body"><h2>Graph view</h2><fieldset class="graph-types"><legend>Show</legend><label><span>Memes</span><input id="show-memes" type="checkbox" checked></label><label><span>Minds</span><input id="show-minds" type="checkbox" checked></label></fieldset><p class="settings-tip">Select a node to read.<br>Drag to explore. Scroll to zoom.</p><div class="legend"><span><i class="dot published"></i> Published</span><span><i class="dot forthcoming"></i> Coming soon</span><span><i class="dot mind"></i> Mind</span><span id="missing-legend" hidden><i class="dot missing"></i> Unwritten link</span></div></div></details>`;
  const theme = '<button class="theme-toggle square" aria-label="Switch to dark theme" title="Switch theme"><span aria-hidden="true">◐</span></button>';
  return `<!doctype html><html lang="${h(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f3eb"><meta name="description" content="${h(description)}"><title>${h(title)}${title === 'Memespace' ? '' : ' · Memespace'}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><script src="/assets/theme.js"></script><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app.js"></script></head><body class="${graph ? 'graph-page' : ''}"><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="/" aria-label="Memespace home">${logo}<span>memespace<span class="brand-dot">.</span></span></a>${graph ? '' : '<a class="back-graph" href="/">↖ Explore the graph</a>'}<div class="account-controls"><button class="sign-in quiet" data-signin>Sign in <span aria-hidden="true">↗</span></button><a class="account-link" href="/account" hidden></a></div>${graph ? '' : theme}</header>${graph ? `<div class="graph-toolbar">${settings}${theme}</div>` : ''}${content}<div id="toast" role="status" aria-live="polite"></div>${authDialog}</body></html>`;
}
function graphPage(graph) {
  return shell('Memespace', `<main id="main" class="graph-main"><h1 class="sr-only">The Memespace graph</h1><div id="graph" aria-hidden="true"></div><div id="focus-panel" class="focus-panel" hidden><span class="focus-dot"></span><span id="focus-name"></span><a id="focus-open">Open ↗</a><button id="clear-focus" class="quiet" aria-label="Clear focus">×</button></div><p id="graph-status" role="status" class="graph-status"></p><div class="graph-bottom"><div class="graph-actions"><button id="zoom-out" class="square" aria-label="Zoom out">−</button><button id="zoom-in" class="square" aria-label="Zoom in">+</button><button id="fit-graph" class="square" aria-label="Reset view" title="Reset view">↺</button></div></div><details class="node-directory"><summary>Browse as a list <span id="node-count">${graph.nodes.length} nodes</span></summary><ul id="node-list">${graph.nodes.map(n=>`<li><a href="${n.path}">${h(n.title)}</a><span>${n.kind==='mind'?n.subtype:n.status==='published'?'Published':'Coming soon'}</span></li>`).join('')}</ul></details><noscript><p class="notice">The interactive graph uses JavaScript. Every Meme is available in the list below.</p></noscript></main>`, { graph:true });
}
function discussion(node) {
  return `<section class="discussion" id="discussion" data-node="${node.id}" data-revision="${h(node.revision)}"><p class="eyebrow">Around this meme</p><h2>What do you think?</h2><div class="reactions" aria-label="Respond to this edition"><button data-reaction="like" aria-pressed="false">♡ Like <span data-count="likes">—</span></button><span class="reaction-divider"></span><button data-reaction="believe" aria-pressed="false">Believe <span data-count="believes">—</span></button><button data-reaction="disbelieve" aria-pressed="false">Disbelieve <span data-count="disbelieves">—</span></button></div><p class="muted small">Responses belong to this edition. Liking and believing are independent.</p><div class="comments-heading"><h3>Conversation</h3></div><form id="comment-form"><label class="sr-only" for="comment-body">Your comment</label><textarea id="comment-body" name="body" placeholder="Add a thought…" maxlength="5000" rows="3" required></textarea><div class="comment-actions"><span class="small muted">New comments are reviewed before they appear publicly.</span><button class="primary" type="submit">Post comment ↗</button></div></form><p id="discussion-status" role="status"></p><ol id="comments" class="comments"></ol><button id="more-comments" class="quiet" hidden>More comments ↓</button></section>`;
}
function reader(node, html, files) {
  const repo = node.repository;
  const fileTree = files.length ? `<ul class="file-tree">${files.map(f=>`<li><a href="${f.viewUrl}" ${f.path===node.entry?'aria-current="page"':''}><span aria-hidden="true">${f.path===node.entry?'▤':'·'}</span> ${h(f.path)}</a></li>`).join('')}</ul>` : '<p class="muted small">No files published yet.</p>';
  const sidebar = `<aside class="repo-sidebar"><p class="eyebrow">The repository</p><h2>${h(node.title)}</h2>${repo ? `<a class="repo-link" href="${h(repo)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a><button class="quiet copy-clone" data-clone="${h(repo)}.git">Copy clone command</button>${node.status==='published'?`<a class="muted small" href="${repo}/tree/${node.revision}" target="_blank" rel="noopener noreferrer">Source at ${node.revision.slice(0,7)} ↗</a>`:''}` : '<p class="muted small">GitHub repository coming soon.</p>'}<div class="sidebar-rule"></div><p class="eyebrow">Published files</p>${fileTree}<div class="sidebar-rule"></div><a class="small" href="/?node=${node.id}">Find this Meme on the graph ↗</a>${repo?`<p class="small muted">Have a change in mind?</p><a class="small" href="${repo}/compare" target="_blank" rel="noopener noreferrer">Propose it on GitHub ↗</a>`:''}</aside>`;
  const article = html ? `<header class="reader-heading"><p class="eyebrow">Meme · Published edition</p><h1 dir="auto">${h(node.title)}</h1></header><article class="prose" dir="${node.language==='fa'?'rtl':'ltr'}" lang="${h(node.language || 'en')}">${html}</article>` : `<section class="coming-soon"><p class="eyebrow" dir="auto">${h(node.title)}</p><h1>Coming soon<span class="ellipsis">…</span></h1></section>`;
  return shell(node.title, `<main id="main" class="reader-layout">${sidebar}<div class="reader-content">${article}${discussion(node)}</div></main>`);
}
function mindPage(node) {
  return shell(node.title, `<main id="main" class="narrow mind-profile" data-mind="${node.id}"><p class="eyebrow">Mind · <span id="mind-kind">${h(node.subtype || 'human')}</span></p><h1 id="mind-name" dir="auto">${h(node.title)}</h1><p id="mind-bio" class="profile-bio" dir="auto">${h(node.summary || '')}</p><a href="/?node=${node.id}&types=mind" class="text-link">Find on the graph ↗</a>${node.repository?`<p><a href="${h(node.repository)}">Repository ↗</a></p>`:''}<p id="mind-status" role="status"></p></main>`);
}
export async function buildSite({ projectRoot = root, output = join(projectRoot,'dist'), bundle = true } = {}) {
  if (resolve(output) !== join(resolve(projectRoot), 'dist')) throw new Error('Build output must be the project dist directory.');
  try { if((await lstat(output)).isSymbolicLink()) throw new Error('Build output cannot be a symlink.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const catalog = validateCatalog(JSON.parse(await readFile(join(projectRoot,'content/catalog.json'),'utf8')));
  // Keep existing entry points while rebuilding: deleting app.js first can make
  // Wrangler's asset watcher cache a missing entry. Remove stale files last.
  const stale=new Set();
  async function collectFiles(path) {
    let entries;try{entries=await readdir(path,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){const child=join(path,entry.name);if(entry.isSymbolicLink())throw new Error('Build output cannot contain symlinks.');if(entry.isDirectory())await collectFiles(child);else stale.add(child);}
  }
  await collectFiles(output); await mkdir(join(output,'assets'),{recursive:true});
  const put = async (path, data) => { const dest=join(output,path); await mkdir(dirname(dest),{recursive:true}); await writeFile(dest,data); stale.delete(dest); };
  const nodes = catalog.nodes.filter(n=>n.visibility!=='private').map(n=>({...n,path:nodePath(n),status:n.kind==='mind'?'mind':n.publication?'published':'unpublished',revision:n.publication?.commit || 'unpublished'}));
  const publicIds=new Set(nodes.map(n=>n.id));
  const edges = catalog.edges.filter(e=>publicIds.has(e.source)&&publicIds.has(e.target)).map(e=>({...e,...EDGE_TYPES[e.type]}));
  for (const node of nodes.filter(n=>n.kind==='meme')) {
    let html = '', files = [];
    if (node.publication) {
      const snapshot = join(projectRoot,'snapshots',node.id,node.publication.commit);
      const manifest = JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
      if (manifest.nodeId!==node.id || manifest.commit!==node.publication.commit || manifest.entry!==node.entry) throw new Error(`Snapshot identity mismatch: ${node.id}`);
      const paths = new Set();
      for (const file of manifest.files) {
        if (!safePath(file.path) || !/^[a-f0-9]{64}$/.test(file.storage) || paths.has(file.path)) throw new Error('Invalid snapshot path.');
        paths.add(file.path);
        const bytes=await readFile(join(snapshot,file.storage));
        if (createHash('sha256').update(bytes).digest('hex')!==file.sha256) throw new Error(`Snapshot hash mismatch: ${file.path}`);
        const key=createHash('sha256').update(file.path).digest('hex').slice(0,20), ext=extname(file.path).toLowerCase();
        const viewUrl=`/files/${node.id}/${node.revision}/${key}`;
        const image=/^\.(png|jpe?g|gif|webp|avif)$/.test(ext);
        const assetUrl=image ? `/assets/content/${file.sha256}${ext}` : null;
        if (assetUrl) await put(assetUrl.slice(1),bytes);
        const preview=image ? `<img class="file-image" src="${assetUrl}" alt="${h(file.path)}">` : `<pre class="file-source"><code>${h(bytes.length<1024*1024 && !bytes.includes(0) ? bytes.toString('utf8') : 'Binary or large file. Open this file in the GitHub source edition.')}</code></pre>`;
        await put(`${viewUrl.slice(1)}/index.html`,shell(file.path,`<main id="main" class="file-view"><a href="${node.path}">← ${h(node.title)}</a><h1>${h(file.path)}</h1>${node.repository?`<a href="${node.repository}/blob/${node.revision}/${file.path.split('/').map(encodeURIComponent).join('/')}">Source on GitHub ↗</a>`:''}${preview}</main>`));
        files.push({...file,viewUrl,assetUrl});
      }
      const entry=manifest.files.find(f=>f.path===node.entry); if(!entry) throw new Error(`Missing entry: ${node.entry}`);
      const references=new Map();
      html=renderMarkdown(await readFile(join(snapshot,entry.storage),'utf8'),{nodes,node,files,references});
      for (const [id,title] of references) {
        if (!nodes.some(n=>n.id===id)) nodes.push({id,slug:id,kind:'meme',title,status:'missing',path:`/m/${id}`,revision:'unpublished'});
        edges.push({id:`ref-${createHash('sha256').update(node.id+':'+id).digest('hex').slice(0,24)}`,source:node.id,target:id,type:'references',...EDGE_TYPES.references});
      }
    }
    await put(`${node.slug}/index.html`,reader(node,html,files));
  }
  for (const node of nodes.filter(n=>n.status==='missing')) await put(`m/${node.id}/index.html`,shell('Coming soon',`<main id="main" class="standalone-coming"><h1>Coming soon…</h1><a href="/?node=${node.id}">Back to the graph ↗</a></main>`));
  for (const node of nodes.filter(n=>n.kind==='mind')) await put(`minds/${node.slug}/index.html`,mindPage(node));
  await put('minds/index.html',shell('Mind',`<main id="main" class="narrow mind-profile" data-mind="dynamic"><p class="eyebrow">Mind · <span id="mind-kind"></span></p><h1 id="mind-name">Mind</h1><p id="mind-bio" class="profile-bio" dir="auto"></p><a id="mind-graph-link" href="/">Find on the graph ↗</a><p id="mind-status" role="status"></p></main>`));
  const graph={version:1,nodes,links:edges};
  await put('assets/graph.json',JSON.stringify(graph));
  await put('index.html',graphPage(graph));
  await put('account/index.html',shell('Your Mind',`<main id="main" class="narrow"><p class="eyebrow">Your place in Memespace</p><h1>Your Mind.</h1><p id="account-status" role="status"></p><div id="account-signed-out" hidden><p>Sign in or join to take part in the conversation.</p><button class="primary" data-signin>Sign in / Join ↗</button></div><div id="account-details" hidden><a id="public-profile" href="/">View your public Mind ↗</a><form id="profile-form"><label>Display name<input name="name" required minlength="2" maxlength="60"></label><label>Kind of Mind<select name="kind"><option value="human">Human</option><option value="ai">AI</option><option value="collective">Collective</option></select></label><label>Bio<textarea name="bio" rows="5" maxlength="2000" dir="auto"></textarea></label><button class="primary" type="submit">Save profile</button></form><a id="moderation-link" href="/admin" hidden>Review comments ↗</a><button id="sign-out" class="quiet">Sign out</button></div></main>`));
  await put('admin/index.html',shell('Comment review',`<main id="main" class="narrow"><p class="eyebrow">Owner tools</p><h1>Review the conversation.</h1><p id="moderation-status" role="status"></p><ol id="moderation-list" class="comments"></ol></main>`));
  await put('404.html',shell('Page not found',`<main id="main" class="standalone-coming"><p class="eyebrow">404</p><h1>No node here.</h1><a href="/">Return to the graph ↗</a></main>`));
  await put('assets/site.css',await readFile(join(root,'web/site.css')));
  await put('assets/theme.js',await readFile(join(root,'web/theme.js')));
  await put('assets/favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f5f3eb"/><g fill="#2449d8" stroke="#2449d8" stroke-width="1.5"><path fill="none" d="m7 24 7-17 12 8-7 11-5-19"/><circle cx="7" cy="24" r="2.8"/><circle cx="14" cy="7" r="2.8"/><circle cx="26" cy="15" r="2.8"/><circle cx="19" cy="26" r="2.8"/></g></svg>`);
  await put('_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n/assets/*\n  Cache-Control: public, max-age=0, must-revalidate\n/files/*\n  X-Robots-Tag: noindex\n`);
  await mkdir(join(projectRoot,'generated'),{recursive:true});
  await writeFile(join(projectRoot,'generated/catalog.json'),JSON.stringify({nodes:nodes.filter(n=>n.status!=='missing').map(({id,title,kind,slug,status,revision})=>({id,title,kind,slug,status,revision}))}));
  if (bundle) {
    const result=await build({entryPoints:[join(root,'web/app.js')],outdir:join(output,'assets'),bundle:true,splitting:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',write:false});
    for(const file of result.outputFiles.sort((a,b)=>Number(a.path.endsWith('/app.js')||a.path.endsWith('\\app.js'))-Number(b.path.endsWith('/app.js')||b.path.endsWith('\\app.js')))) {
      await put(file.path.slice(output.length+1),file.contents);
    }
  }
  for(const file of stale) await rm(file,{force:true});
  const count = async path => (await Promise.all((await readdir(path,{withFileTypes:true})).map(f=>f.isDirectory()?count(join(path,f.name)):1))).reduce((a,b)=>a+b,0);
  const fileCount=await count(output); if(fileCount>20000) throw new Error('Build exceeds the Cloudflare Free asset count.');
  return { nodes:nodes.length,edges:edges.length,files:fileCount };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Built Memespace:',await buildSite()); } catch(error) { console.error(error.message); process.exitCode=1; }
}

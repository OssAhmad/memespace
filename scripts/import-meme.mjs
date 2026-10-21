import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../lib/catalog.mjs';

export function git(repo, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repo, ...args], { encoding, maxBuffer: 30 * 1024 * 1024, windowsHide: true });
}
export function safePath(path) {
  return typeof path === 'string' && path.length < 240 && !path.startsWith('/') && !/[\\\x00-\x1f]/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.'));
}
export async function importMeme({ root = process.cwd(), slug, repo, ref, includes = [] }) {
  const catalogPath = join(root, 'content/catalog.json');
  const catalog = validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
  const node = catalog.nodes.find(n => n.kind === 'meme' && (n.slug === slug || n.id === slug));
  if (!node) throw new Error('Meme not found in content/catalog.json.');
  if (!ref || !repo || ref.startsWith('-')) throw new Error('Provide --repo and an explicitly approved --ref (a commit or tag).');
  if(node.repository){
    let remote='';try{remote=git(resolve(repo),['remote','get-url','origin']).trim().replace(/^git@github\.com:/,'https://github.com/').replace(/\.git$/,'').replace(/\/$/,'');}catch{}
    if(remote.toLowerCase()!==node.repository.toLowerCase())throw new Error('The local origin does not match this Meme\'s catalog repository URL. Check the selected repository.');
  }
  const commit = git(resolve(repo), ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const entry = node.entry || 'meme.md';
  includes = [...new Set([entry, ...includes])];
  if (!includes.every(safePath)) throw new Error('Include only relative, non-hidden repository paths.');
  const records = git(resolve(repo), ['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean).map(record => {
    const tab = record.indexOf('\t'), [mode, type, hash] = record.slice(0, tab).split(' ');
    return { mode, type, hash, path: record.slice(tab + 1) };
  });
  const chosen = records.filter(f => includes.some(p => f.path === p || f.path.startsWith(p.replace(/\/$/, '') + '/')));
  if (!chosen.some(f => f.path === entry)) throw new Error(`${entry} is absent from this commit. Commit it before importing.`);
  for (const include of includes) if (!chosen.some(f => f.path === include || f.path.startsWith(include + '/'))) throw new Error(`Included path not found: ${include}`);
  const destination = join(root, 'snapshots', node.id, commit);
  const temporary = join(root, 'snapshots', `.import-${randomUUID()}`);
  await mkdir(temporary, { recursive: true });
  try {
    const files = [];
    let total = 0;
    for (const file of chosen) {
      if (!safePath(file.path) || file.type !== 'blob' || !['100644', '100755'].includes(file.mode)) throw new Error(`Unsupported file or symlink: ${file.path}`);
      const bytes = git(resolve(repo), ['cat-file', 'blob', file.hash], 'buffer');
      if (bytes.length > 24 * 1024 * 1024 || (total += bytes.length) > 100 * 1024 * 1024) throw new Error('Snapshot too large. Link large datasets from GitHub or external storage.');
      if (bytes.subarray(0, 50).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Git LFS pointer is not its data: ${file.path}`);
      const storage = createHash('sha256').update(file.path).digest('hex');
      await writeFile(join(temporary, storage), bytes);
      files.push({ path: file.path, storage, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const manifest = { nodeId: node.id, commit, entry, files };
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await mkdir(join(root, 'snapshots', node.id), { recursive: true });
    try { await rename(temporary, destination); }
    catch (error) {
      // Existing editions are immutable, including their publication allowlist.
      const existing = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
      if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error('This commit was already imported with a different file selection. Use a new commit.');
    }
    node.publication = { commit };
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
    return { id: node.id, commit, files: files.length };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), slug = args.shift(), options = { slug, includes: [] };
    while (args.length) {
      const flag = args.shift(), value = args.shift();
      if (!value || !['--repo', '--ref', '--include'].includes(flag)) throw new Error('Usage: npm run publish:meme -- <slug> --repo <local-repo> --ref <commit> [--include <path>]');
      if (flag === '--include') options.includes.push(value); else options[flag.slice(2)] = value;
    }
    console.log('Imported locally:', await importMeme(options));
    console.log('Review the catalog and snapshot, then build. Nothing was uploaded.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

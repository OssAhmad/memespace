import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { importMeme } from '../scripts/import-meme.mjs';
import { buildSite, renderMarkdown } from '../scripts/build.mjs';
import { validateCatalog } from '../lib/catalog.mjs';

test('only marked Meme links become graph references; unsafe HTML is stripped',()=>{
  const references=new Map(), nodes=[{id:'meme-one',slug:'one',kind:'meme'},{id:'meme-two',slug:'two',kind:'meme',title:'Two'}];
  const html=renderMarkdown('[Marked](meme:meme-two) [Ordinary](https://example.com) <script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><a data-meme="meme-missing">Missing</a>',{nodes,node:nodes[0],references});
  assert.deepEqual([...references.keys()],['meme-two','meme-missing']);assert.match(html,/href="\/two"/);assert.doesNotMatch(html,/<script|onerror|javascript:/);assert.match(html,/\/m\/meme-missing/);
});
test('catalog rejects mutable commits, reserved routes and broken edges',()=>{
  const node={id:'meme-one',slug:'one',kind:'meme',title:'One'};
  assert.throws(()=>validateCatalog({version:1,nodes:[{...node,publication:{commit:'main'}}],edges:[]}));
  assert.throws(()=>validateCatalog({version:1,nodes:[{...node,slug:'api'}],edges:[]}));
  assert.throws(()=>validateCatalog({version:1,nodes:[node],edges:[{id:'edge-one',source:'meme-one',target:'absent',type:'owns'}]}));
});
test('manual import pins entry, file tree, and reference graph to Git objects; dirty/new content stays out',async()=>{
  const base=resolve('.test-tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'publication-'));
  const repo=join(root,'repo');await mkdir(repo);await mkdir(join(root,'content'));
  const run=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true});
  try{
    run('init');run('config','user.name','Publication test');run('config','user.email','test@example.test');
    await writeFile(join(repo,'meme.md'),'# Approved entry\n\n[Another meme](meme:meme-unwritten)\n\n[Notes](notes.txt)\n');
    await writeFile(join(repo,'notes.txt'),'Approved notes');await writeFile(join(repo,'private.txt'),'Excluded');
    run('add','.');run('commit','-m','Approved fixture');const commit=run('rev-parse','HEAD').trim();
    const catalog={version:1,nodes:[{id:'meme-fixture',slug:'fixture',kind:'meme',title:'Fixture',language:'en',entry:'meme.md',publication:null}],edges:[]};
    await writeFile(join(root,'content/catalog.json'),JSON.stringify(catalog));
    await writeFile(join(repo,'meme.md'),'UNAPPROVED CHANGE');
    const imported=await importMeme({root,slug:'fixture',repo,ref:commit,includes:['notes.txt']});assert.equal(imported.commit,commit);
    await buildSite({projectRoot:root,bundle:false});
    const page=await readFile(join(root,'dist/fixture/index.html'),'utf8');assert.match(page,/Approved entry/);assert.doesNotMatch(page,/UNAPPROVED CHANGE|private\.txt/);
    const graph=JSON.parse(await readFile(join(root,'dist/assets/graph.json'),'utf8'));assert.equal(graph.nodes.find(n=>n.id==='meme-unwritten').status,'missing');assert.equal(graph.links.length,1);
    assert.match(await readFile(join(root,'dist/m/meme-unwritten/index.html'),'utf8'),/Coming soon/);
    await assert.rejects(importMeme({root,slug:'fixture',repo,ref:commit,includes:['notes.txt','private.txt']}),/already imported/);
    const snapshot=join(root,'snapshots','meme-fixture',commit),manifest=JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
    await writeFile(join(snapshot,manifest.files[0].storage),'Tampered');await assert.rejects(buildSite({projectRoot:root,bundle:false}),/hash mismatch/);
    const current=JSON.parse(await readFile(join(root,'content/catalog.json'),'utf8'));current.nodes[0].visibility='private';
    await writeFile(join(root,'content/catalog.json'),JSON.stringify(current));await buildSite({projectRoot:root,bundle:false});
    assert.equal(JSON.parse(await readFile(join(root,'dist/assets/graph.json'),'utf8')).nodes.length,0);
    await assert.rejects(readFile(join(root,'dist/fixture/index.html'),'utf8'),{code:'ENOENT'});
  } finally {await rm(root,{recursive:true,force:true});}
});

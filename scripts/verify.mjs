// Read-only checks: safe to run locally or against either deployed hostname.
const base=new URL(process.argv[2] || 'http://127.0.0.1:8787');
if(!['http:','https:'].includes(base.protocol))throw new Error('Provide an http(s) site origin.');
const cases=[
  ['/',200,'The Memespace graph'],
  ['/memespace',200,'The repository'],
  ['/mensonaut-chronicles',200,'Mensonaut Chronicles'],
  ['/kojayi',200,'کجایی'],
  ['/the-market-of-human-mating',200,'The Market of Human Mating'],
  ['/minds/ossa',200,'Oss Ahmad'],
  ['/minds/rayray',200,'RayRay'],
  ['/account',200,'Your Mind'],
  ['/admin',200,'Review the conversation'],
  ['/this-page-does-not-exist',404,'No node here'],
  ['/api/does-not-exist',404,'Not found']
];
for(const [path,status,text] of cases){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)}),body=await response.text();
  if(response.status!==status || !body.includes(text))throw new Error(`${path}: expected ${status} and ${JSON.stringify(text)}, received ${response.status}`);
  console.log(`PASS ${response.status} ${path}`);
}
const graphResponse=await fetch(new URL('/assets/graph.json',base));if(!graphResponse.ok)throw new Error('Graph asset unavailable.');
const graph=await graphResponse.json();
if(!Array.isArray(graph.nodes)||!Array.isArray(graph.links))throw new Error('Invalid graph data.');
const html=await (await fetch(base)).text();
const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);
const checked=new Set();
async function checkScript(path){
  const url=new URL(path,base);if(checked.has(url.href))return;checked.add(url.href);
  const response=await fetch(url);if(!response.ok || !(response.headers.get('Content-Type')||'').includes('javascript'))throw new Error(`Script unavailable: ${url.pathname}`);
  const source=await response.text();
  for(const match of source.matchAll(/(?:from\s*|import\s*\()"(\.\/?[^"\n]+\.js)"/g))await checkScript(new URL(match[1],url).href);
}
for(const script of scripts)await checkScript(script);
console.log(`PASS graph (${graph.nodes.length} nodes, ${graph.links.length} links), ${checked.size} script modules`);
const session=await fetch(new URL('/api/session',base));if(!session.ok)throw new Error('Session API is unavailable.');
const info=await session.json();console.log(`PASS session API; email sign-in ${info.available?'configured':'not configured'}`);

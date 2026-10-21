import { readFile, writeFile } from 'node:fs/promises';
const id = process.argv[2];
if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id || '') || id === '00000000-0000-0000-0000-000000000000') throw new Error('Usage: npm run configure:d1 -- <database-id-from-wrangler>');
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.d1_databases[0].database_id = id;
await writeFile('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log('Saved the D1 binding in wrangler.jsonc. No remote changes made.');

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
const dry = process.argv.includes('--dry-run');
if (!dry && config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000') throw new Error('Create your D1 database and run npm run configure:d1 -- <id> first. See DEPLOY.md.');
if (config.vars?.LOCAL_AUTH) throw new Error('Refusing to deploy local authentication settings.');
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', ...(dry ? ['--dry-run'] : [])], { stdio: 'inherit', windowsHide: true });
process.exit(result.status ?? 1);

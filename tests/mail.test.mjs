import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import workerd from 'workerd';

test('email transport runs in workerd and rejects provider errors and redirects', async () => {
  const base = resolve('.test-tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'mail-runtime-'));
  try {
    await build({ entryPoints: ['tests/fixtures/mail-runtime.js'], bundle: true, format: 'esm', platform: 'browser', outfile: join(root, 'worker.js') });
    await writeFile(join(root, 'config.capnp'), `using Workerd = import "/workerd.capnp";
const config :Workerd.Config = (services = [(name = "mail-tests", worker = (
  modules = [(name = "worker.js", esModule = embed "worker.js")],
  compatibilityDate = "2026-10-19",
  globalOutbound = (name = "mail-tests", entrypoint = "Resend")
))]);`);
    const require = createRequire(import.meta.url);
    const schemaDirectory = dirname(require.resolve('workerd/workerd.capnp'));
    const result = spawnSync(workerd.default, ['test', '-I', schemaDirectory, join(root, 'config.capnp')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /PASS.*mail-tests/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import { createReadStream, watch } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreview } from './build-preview.mjs';

const host = '127.0.0.1';
const sourceDirectory = fileURLToPath(new URL('../preview/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function parsePort(args) {
  if (args.length === 0) return 4321;
  if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1])) {
    throw new Error('Usage: node scripts/preview.mjs [--port 4321]');
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The preview port must be an integer between 1 and 65535.');
  }
  return port;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function findFile(root, candidate) {
  if (!isInside(root, candidate)) return null;
  try {
    let resolved = await realpath(candidate);
    if (!isInside(root, resolved)) return null;
    let details = await stat(resolved);
    if (details.isDirectory()) {
      resolved = await realpath(path.join(resolved, 'index.html'));
      if (!isInside(root, resolved)) return null;
      details = await stat(resolved);
    }
    return details.isFile() ? { resolved, size: details.size } : null;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) return null;
    throw error;
  }
}

function sendText(request, response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : message);
}

function sendFile(request, response, file, status) {
  response.writeHead(status, {
    'Content-Type': mimeTypes[path.extname(file.resolved).toLowerCase()] ??
      'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file.resolved);
  stream.on('error', (error) => {
    console.error(`Could not read a preview file: ${error.message}`);
    response.destroy(error);
  });
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  const outputDirectory = await realpath(await buildPreview());
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendText(request, response, 405, 'This local preview accepts GET and HEAD requests only.\n');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    } catch {
      sendText(request, response, 400, 'Invalid URL.\n');
      return;
    }
    // Reject Windows separators, alternate data streams, and decoded dot segments.
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':') ||
        pathname.split('/').some((segment) => segment === '..' || segment === '.')) {
      sendText(request, response, 400, 'Invalid preview path.\n');
      return;
    }

    try {
      const candidate = path.resolve(outputDirectory, `.${pathname}`);
      const file = await findFile(outputDirectory, candidate);
      if (file) {
        sendFile(request, response, file, 200);
        return;
      }
      const notFound = await findFile(outputDirectory, path.join(outputDirectory, '404.html'));
      if (notFound) sendFile(request, response, notFound, 404);
      else sendText(request, response, 404, 'Page not found.\n');
    } catch (error) {
      console.error(`Preview request failed: ${error.message}`);
      if (!response.headersSent) sendText(request, response, 500, 'Could not serve this preview page.\n');
      else response.destroy();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  }).catch((error) => {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Try npm run review -- --port ${port + 1}.`);
    }
    throw error;
  });
  console.log(`Memespace local review: http://${host}:${port}/`);
  console.log('Changes in preview/ rebuild the pages. Refresh the browser to see them.');

  let timer;
  let building = false;
  let pending = false;
  async function rebuild() {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    do {
      pending = false;
      try {
        await buildPreview();
        console.log('Preview rebuilt.');
      } catch (error) {
        console.error(`Preview build failed: ${error.message}`);
      }
    } while (pending);
    building = false;
  }

  let watcher;
  try {
    watcher = watch(sourceDirectory, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 150);
    });
    watcher.on('error', (error) => {
      console.error(`File watching stopped: ${error.message}. Restart the preview after editing.`);
    });
  } catch (error) {
    console.error(`File watching is unavailable: ${error.message}. Restart the preview after editing.`);
  }
  server.on('error', (error) => console.error(`Preview server error: ${error.message}`));

  function shutdown() {
    clearTimeout(timer);
    watcher?.close();
    server.close();
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(`Could not start the local preview: ${error.message}`);
  process.exitCode = 1;
});

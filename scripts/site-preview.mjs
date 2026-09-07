import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../site', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end(); return;
    }
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (pathname === '/') path = resolve(root, 'index.html');
    else if (!extname(path)) path += '.html';
    let code = pathname === '/404' || pathname === '/404.html' ? 404 : 200;
    try {
      path = await realpath(path);
      if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(path)).isFile()) throw new Error('not file');
    } catch { path = resolve(root, '404.html'); code = 404; }
    const data = await readFile(path);
    res.writeHead(code, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(400).end(); }
});
server.listen(8097, '127.0.0.1', () => console.log('Windtunnel preview: http://127.0.0.1:8097'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

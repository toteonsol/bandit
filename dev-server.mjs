// Local dev server: serves /public and runs the /api/*.js functions the same way Vercel does
// (Web-standard Request in, Response out). Usage: npm run dev  (reads SERV_API_KEY from .env.local)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

try {
  for (const line of (await readFile(join(root, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const mod = await import(pathToFileURL(join(root, 'api', `${name}.js`)).href);
      const handler = mod[req.method];
      if (!handler) {
        res.writeHead(405, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, body }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, 'public', path);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch (e) {
    const missing = e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND';
    if (!missing) console.error(e);
    res.writeHead(missing ? 404 : 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: missing ? 'Not found' : e.message }));
  }
}).listen(port, () => console.log(`BANDIT dev server: http://localhost:${port}`));

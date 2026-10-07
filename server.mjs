// 별도 패키지 설치 없이 Node.js로 실행하는 로컬 서버입니다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApiHandler, apiStatus } from './api-handler.mjs';
let ragIndex = null;
try { ragIndex = JSON.parse(await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const ask = createApiHandler(fetch, ragIndex);
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/cheomseongdae.jpg': ['cheomseongdae.jpg', 'image/jpeg'], '/mayor.png': ['mayor.png', 'image/png'] };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8000');
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const result = apiStatus(process.env);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
    }
    if (url.pathname === '/api/ask') {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}) });
      const result = await ask(request, process.env);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
    }
    const asset = assets[url.pathname];
    if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
    const bytes = await readFile(new URL('./dist/' + asset[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(500); res.end('Server error'); }
}).listen(8000, '127.0.0.1', () => console.log('홈페이지: http://127.0.0.1:8000 / 종료: Ctrl+C'));

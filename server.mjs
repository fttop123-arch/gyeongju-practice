// 별도 패키지 설치 없이 Node.js로 실행하는 로컬 서버입니다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApiHandler, apiStatus } from './api-handler.mjs';
import { sampleExcelResponse } from './sample-excel.mjs';
import { applicationUploadResponse } from './application-xlsx.mjs';
let ragIndex = null;
try { ragIndex = JSON.parse(await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let lawIndex = null;
try { lawIndex = JSON.parse(await readFile(new URL('./data/public-data-law-index.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let organization = null;
try {
  const data = JSON.parse(await readFile(new URL('./data/organization.json', import.meta.url), 'utf8'));
  if (!Array.isArray(data.employees) || data.employees.some(row => !row || ['department','name','phone','duties','team'].some(key => typeof row[key] !== 'string'))) throw new Error('INVALID_ORGANIZATION');
  organization = data;
} catch (error) {
  if (error.code !== 'ENOENT') console.warn('조직도 참조 데이터를 읽지 못했습니다. 기존 AI 기능은 계속 사용할 수 있습니다.');
}
const ask = createApiHandler(fetch, ragIndex, lawIndex, organization);
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/cheomseongdae.jpg': ['cheomseongdae.jpg', 'image/jpeg'], '/mayor.png': ['mayor.png', 'image/png'] };
assets['/help-manual.js'] = ['help-manual.js', 'text/javascript; charset=utf-8'];
assets['/public-data-ui.js'] = ['public-data-ui.js', 'text/javascript; charset=utf-8'];
assets['/application-upload-ui.js'] = ['application-upload-ui.js', 'text/javascript; charset=utf-8'];
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8000');
    if (url.pathname === '/api/application-upload') {
      const request = new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
      const result = await applicationUploadResponse(request,process.env);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
    }
    if (url.pathname === '/api/sample-excel') {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}) });
      const result = await sampleExcelResponse(request, process.env);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer())); return;
    }
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

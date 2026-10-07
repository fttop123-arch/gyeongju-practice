// 현재 디자인과 사진을 호스팅용 서버에 포함합니다. API 키는 포함하지 않습니다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const assets = {};
for (const [name, type] of [['index.html','text/html; charset=utf-8'], ['style.css','text/css; charset=utf-8'], ['public-data-ui.js','text/javascript; charset=utf-8'], ['cheomseongdae.jpg','image/jpeg'], ['mayor.png','image/png']]) {
  assets['/' + name] = { type, data: (await readFile(new URL('./dist/' + name, import.meta.url))).toString('base64') };
}
assets['/'] = assets['/index.html'];
const providers = await readFile(new URL('./llm-providers.mjs', import.meta.url), 'utf8');
const embedding = await readFile(new URL('./embedding-provider.mjs', import.meta.url), 'utf8');
const rag = (await readFile(new URL('./rag.mjs', import.meta.url), 'utf8')).replace("import { embedTexts } from './embedding-provider.mjs';", '');
const index = await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8');
const publicData = await readFile(new URL('./public-data-helper.mjs', import.meta.url), 'utf8');
const sampleExcel = await readFile(new URL('./sample-excel.mjs', import.meta.url), 'utf8');
const handler = (await readFile(new URL('./api-handler.mjs', import.meta.url), 'utf8')).replace("import { getLlmConfiguration } from './llm-providers.mjs';", '').replace("import { answerWithRag } from './rag.mjs';", '').replace("import { analyzePublicDataApplication } from './public-data-helper.mjs';", '');
const code = providers + '\n' + embedding + '\n' + rag + '\n' + publicData + '\n' + sampleExcel + '\n' + handler + '\nconst ragIndex = ' + index + ';\nconst ask = createApiHandler(fetch, ragIndex);\nconst assets = ' + JSON.stringify(assets) + `;
export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/status' && request.method === 'GET') return apiStatus(env);
  if (url.pathname === '/api/ask') return ask(request, env);
  if (url.pathname === '/api/sample-excel') return sampleExcelResponse(request, env);
  const asset = assets[url.pathname];
  if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found', {status:404});
  return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), c => c.charCodeAt(0)), {headers:{'Content-Type':asset.type,'Cache-Control':'no-cache'}});
} };
`;
await mkdir(new URL('./dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/server/index.js', import.meta.url), code);
console.log('호스팅용 서버 생성 완료 (API 키 미포함)');

import { loadRegistrationCatalog } from './registration-catalog.mjs';
// 현재 디자인과 사진을 호스팅용 서버에 포함합니다. API 키는 포함하지 않습니다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const authCode = await readFile(new URL('./practice-auth.mjs', import.meta.url), 'utf8');
const siteAccessCode=(await readFile(new URL('./site-access.mjs',import.meta.url),'utf8')).replace("import { practiceAuth } from './practice-auth.mjs';",'');
const assets = {};
for (const [name, type] of [['index.html','text/html; charset=utf-8'], ['style.css','text/css; charset=utf-8'], ...['registration-ui.mjs','registration-schema.mjs','registration-batch.mjs','csv-analysis.mjs'].map(n=>[n,'text/javascript; charset=utf-8']), ['registration.css','text/css; charset=utf-8'], ['practice-auth-ui.js','text/javascript; charset=utf-8'], ['help-manual.js','text/javascript; charset=utf-8'], ['public-data-ui.js','text/javascript; charset=utf-8'], ['application-upload-ui.js','text/javascript; charset=utf-8'], ['cheomseongdae.jpg','image/jpeg'], ['mayor.png','image/png']]) {
  assets['/' + name] = { type, data: (await readFile(new URL('./dist/' + name, import.meta.url))).toString('base64') };
}
assets['/'] = assets['/index.html'];
// 내부 조직도 데이터는 공개 Worker에 포함하지 않습니다. 검색 모듈만 포함하고 데이터는 null로 둡니다.
const organizationSearch = await readFile(new URL('./organization-search.mjs', import.meta.url), 'utf8');
const providers = await readFile(new URL('./llm-providers.mjs', import.meta.url), 'utf8');
const embedding = await readFile(new URL('./embedding-provider.mjs', import.meta.url), 'utf8');
const rag = (await readFile(new URL('./rag.mjs', import.meta.url), 'utf8')).replace("import { embedTexts } from './embedding-provider.mjs';", '');
const index = await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8');
const publicData = await readFile(new URL('./public-data-helper.mjs', import.meta.url), 'utf8');
const lawRag = (await readFile(new URL('./public-data-law-rag.mjs',import.meta.url),'utf8')).replace("import { embedTexts } from './embedding-provider.mjs';",'').replace("import { cosine } from './rag.mjs';",'').replace("import { analyzePublicDataApplication } from './public-data-helper.mjs';",'');
const lawIndex = await readFile(new URL('./data/public-data-law-index.json',import.meta.url),'utf8');
const metadata = await readFile(new URL('./application-metadata.mjs', import.meta.url), 'utf8');
const upload = await readFile(new URL('./application-xlsx.mjs', import.meta.url), 'utf8');
const sampleExcel = (await readFile(new URL('./sample-excel.mjs', import.meta.url), 'utf8')).replace("import { applicationMetadata } from './application-metadata.mjs';",'');
const handler = (await readFile(new URL('./api-handler.mjs', import.meta.url), 'utf8')).replace("import { recommendOrganization } from './organization-search.mjs';",'').replace("import { getLlmConfiguration } from './llm-providers.mjs';", '').replace("import { answerWithRag } from './rag.mjs';", '').replace("import { analyzePublicDataApplication } from './public-data-helper.mjs';", '').replace("import { analyzeWithPublicDataLaws } from './public-data-law-rag.mjs';",'');
// 등록 모듈은 기존 provider/auth/ZIP 함수에 연결합니다. 원본 CSV는 포함하지 않습니다.
const registrationParts=[];
for (const file of ['dist/registration-schema.mjs','registration-errors.mjs','registration-law-verifier.mjs','registration-metadata.mjs','registration-excel.mjs','registration-api.mjs']) {
  registrationParts.push((await readFile(new URL('./'+file,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''));
}
let classificationCatalog=null;try{classificationCatalog=await loadRegistrationCatalog();}catch{console.warn('분류체계DB 로딩 실패: 호스팅 준비본의 최종 다운로드는 차단됩니다.');}
const registrationCode=registrationParts.join('\n');
const code = authCode + '\n' + siteAccessCode + '\n' + organizationSearch + '\n' + providers + '\n' + embedding + '\n' + rag + '\n' + publicData + '\n' + lawRag + '\n' + metadata + '\n' + upload + '\n' + sampleExcel + '\n' + handler.replace("import { applicationMetadata } from './application-metadata.mjs';",'') + '\n' + registrationCode + '\nconst classificationCatalog = '+JSON.stringify(classificationCatalog)+';\nconst registration = createRegistrationHandler(fetch,async()=>classificationCatalog);\nconst ragIndex = ' + index + ';\nconst lawIndex = ' + lawIndex + ';\nconst ask = createApiHandler(fetch, ragIndex, lawIndex);\nconst assets = ' + JSON.stringify(assets) + `;
export default { async fetch(request, env) {
  const url = new URL(request.url);
  const gate=await siteAccessResponse(request,env);if(gate)return gate;
  if (['/api/registration-metadata','/api/registration-excel','/api/registration-catalog'].includes(url.pathname)) return registration(request, env);
  if (url.pathname === '/api/auth') return practiceAuth.handle(request, env);
  if (url.pathname === '/api/status' && request.method === 'GET') return apiStatus(env);
  if (url.pathname === '/api/ask') return ask(request, env);
  if (url.pathname === '/api/sample-excel') return sampleExcelResponse(request, env);
  if (url.pathname === '/api/application-upload') return applicationUploadResponse(request, env);
  const asset = assets[url.pathname];
  if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found', {status:404});
  return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), c => c.charCodeAt(0)), {headers:{'Content-Type':asset.type,'Cache-Control':'no-store','Vary':'Cookie'}});
} };
`;
await mkdir(new URL('./dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/server/index.js', import.meta.url), code.replaceAll("import { practiceAuth } from './practice-auth.mjs';",''));
console.log('호스팅용 서버 생성 완료 (API 키 미포함)');

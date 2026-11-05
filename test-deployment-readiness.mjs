// 합성 CSV만 사용. 외부 API/조직도/.env를 읽지 않고 빌드된 Worker의 전체 경로를 검증합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {analyzeCsv} from './dist/csv-analysis.mjs';
import {registrationBatchItem,registrationAutoApply,registrationDownloadPlan} from './dist/registration-batch.mjs';
const origin='https://synthetic.example';
const env={SITE_ACCESS_PASSWORD:'synthetic-password-only',HASA_API_KEY:'synthetic-api-only',LLM_PROVIDER:'hasa',LLM_MODEL:'synthetic-model',HUB_CONNECTION_VERIFIED:'true'};
let pair,calls=0;const seen=new Map();
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),'https://open.hasa.re.kr/v1/chat/completions');
 assert(!options.body.includes('SYNTHETIC_CELL_VALUE'));
 calls++;
 const input=JSON.parse(JSON.parse(options.body).messages[1].content);
 const count=(seen.get(input.fileName)||0)+1;seen.set(input.fileName,count);
 return Response.json({choices:[{message:{content:JSON.stringify({dataName:input.fileName.replace(/\.csv$/i,''),keywords:['가상','시설'],major:pair.major,minor:pair.minor,basis:'',basisRecommendation:{lawName:'주차장법',reason:'합성 시험의 업무 관련 법률 후보'},evidence:input.fileName==='합성시설2.csv'&&count===1?[]:['dataName','keywords','major','minor'].map(field=>({field,source:'filename'}))})}}]});
};
const {default:worker}=await import('./dist/server/index.js');
globalThis.fetch=nativeFetch;
const request=(path,body,cookie='',client='test')=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','CF-Connecting-IP':client},...(body===undefined?{}:{body:JSON.stringify(body)})});
for(const count of [3,4])test(`Worker HTTPS: 인증→합성 CSV ${count}개→실패 CSV만 재시도→등록자료.xlsx`,async()=>{
 assert.equal((await worker.fetch(request('/api/registration-catalog'),env)).status,401);
 const login=await worker.fetch(request('/api/auth',{accessCode:env.SITE_ACCESS_PASSWORD}),env);
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const catalogResponse=await worker.fetch(request('/api/registration-catalog',undefined,cookie),env);assert.equal(catalogResponse.status,200);
 const catalog=await catalogResponse.json();assert(catalog.verified);pair=catalog.entries[0];
 seen.clear();const items=[];const before=calls;
 for(let n=1;n<=count;n++){
  const file={name:`합성시설${n}.csv`},item=registrationBatchItem(file,`item-${n}`);
  const csv='시설명,수량\nSYNTHETIC_CELL_VALUE,2';
  item.structure=analyzeCsv(new TextEncoder().encode(csv),file.name);
  const response=await worker.fetch(request('/api/registration-metadata',{structure:item.structure},cookie,`case-${count}`),env);
  assert.equal(response.status,200);registrationAutoApply(item,await response.json(),catalog);items.push(item);
 }
 assert.equal(calls-before,count+1);assert.equal(seen.get('합성시설2.csv'),2);
 const plan=registrationDownloadPlan(items,catalog);assert.equal(plan.excluded.length,0);assert.equal(plan.included.length,count);
 const response=await worker.fetch(request('/api/registration-excel',{kind:'final',records:plan.included},cookie),env);
 assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/filename\*=UTF-8/);
 const bytes=new Uint8Array(await response.arrayBuffer()),xml=new TextDecoder().decode(bytes);
 assert(xml.includes(`A1:W${count+1}`));assert.equal([...xml.matchAll(/<c r="/g)].length,23*(count+1));
 assert(!xml.includes('SYNTHETIC_CELL_VALUE'));assert(!xml.includes(env.HASA_API_KEY));assert(!xml.includes(env.SITE_ACCESS_PASSWORD));
 await mkdir(new URL('./.local-qa/',import.meta.url),{recursive:true});
 await writeFile(new URL(`./.local-qa/등록자료_합성${count}건.xlsx`,import.meta.url),bytes);
 for(const path of ['/.env','/data/organization.json','/internal-rpa/data_register.py'])assert.equal((await worker.fetch(request(path,undefined,cookie),env)).status,404);
});

// 로컬 실제 API/UI 테스트. 인증값과 업로드된 개인정보 필드는 출력하지 않습니다.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createSampleExcel} from './sample-excel.mjs';
import {extractApplicationXlsx} from './application-xlsx.mjs';
process.loadEnvFile(new URL('./.env',import.meta.url));
const dir=process.argv[2]||'C:/Users/Owner/Desktop/AI실습/gyeongju-debug-package/application-upload';
const origin='http://127.0.0.1:8000', results=[];
const secretValues=Object.entries(process.env).filter(([k,v])=>/KEY|TOKEN|SECRET|ACCESS_CODE/i.test(k)&&v).map(([,v])=>v);
const safe=value=>{let s=JSON.stringify(value);for(const v of secretValues)s=s.split(v).join('[숨김]');return s;};
const record=value=>{results.push(value);console.log(safe(value));};
async function upload(bytes,name){const body=new FormData();body.append('file',new Blob([bytes]),name);body.append('accessCode',process.env.PRACTICE_ACCESS_CODE);const r=await fetch(origin+'/api/application-upload',{method:'POST',headers:{Origin:origin},body});return {http:r.status,data:await r.json()};}
await mkdir(dir,{recursive:true});
const sample=await readFile(dir+'/sample.xlsx'),shifted=await readFile(dir+'/shifted.xlsx'),missing=await readFile(dir+'/missing.xlsx');
const expected=(await extractApplicationXlsx(sample)).fields;
for(const [name,bytes,status] of [['sample.xlsx',sample,200],['shifted.xlsx',shifted,200],['missing.xlsx',missing,200],['wrong.txt',sample,400],['empty.xlsx',new Uint8Array(),400],['corrupt.xlsx',new TextEncoder().encode('broken'),400],['wrong-form.xlsx',createSampleExcel(['컬럼명']),400]]){
  const response=await upload(bytes,name);assert.equal(response.http,status);
  if(name==='sample.xlsx'||name==='shifted.xlsx'){assert.deepEqual(response.data.fields,expected);assert.deepEqual(Object.keys(response.data.fields),['receiptNumber','receiptDate','dataName','content','purpose']);assert(!JSON.stringify(response.data).includes('마스킹된신청인'));}
  if(name==='missing.xlsx')assert.equal(response.data.warnings.length,3);
  record({test:name,http:response.http,...(response.data.error?{message:response.data.error}:{warnings:response.data.warnings,fields:response.data.fields})});
}
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
let asks=0,lastRequest=null;page.on('request',r=>{if(r.url().endsWith('/api/ask')){asks++;lastRequest=r.postDataJSON();}});
try{
  await page.goto(origin);await page.waitForFunction(()=>!document.querySelector('#ai-form button[type=submit]').disabled);
  await page.locator('#ai-access-code').fill(process.env.PRACTICE_ACCESS_CODE);
  await page.locator('#ai-mode').selectOption('public-data');await page.locator('#application-input-method').selectOption('upload');
  await page.locator('#application-file').setInputFiles(dir+'/sample.xlsx');
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/application-upload'));await page.locator('#application-extract').click();assert.equal((await wait).status(),200);
  await page.locator('#application-preview').waitFor({state:'visible'});
  for(const [key,value] of Object.entries(expected))assert.equal(await page.locator('#application-'+key).inputValue(),value);
  assert.equal(asks,0);record({test:'추출 화면',fiveFields:true,automaticAIRequests:asks,privateFieldsExcluded:true});
  await page.locator('#application-content').fill(expected.content+' 제공 가능한 파일 형식과 기준일을 확인해 주세요.');
  await page.locator('#application-dataName').fill('경주시 아파트 현황(수정한 가상 신청)');
  await page.locator('#application-purpose').fill('수정한 가상자료 분석 실습');
  async function analyze(button,label){const start=Date.now();const pending=page.waitForResponse(r=>r.url().endsWith('/api/ask'),{timeout:155000});await button.click();const response=await pending;const data=await response.json();if(!response.ok()){record({test:label,http:response.status(),error:data.error});throw new Error('실제 AI 분석 테스트 실패');}await page.waitForFunction(()=>!document.querySelector('#ai-form button[type=submit]').disabled,{timeout:155000});const screen=await page.locator('body').innerText();assert(!secretValues.some(s=>screen.includes(s)||JSON.stringify(data).includes(s)));return {data,http:response.status(),seconds:Math.round((Date.now()-start)/100)/10};}
  const uploaded=await analyze(page.locator('#application-confirm'),'업로드 분석');
  assert(lastRequest.question.includes('제공 가능한 파일 형식과 기준일'));assert(lastRequest.question.includes('수정한 가상자료'));assert(!lastRequest.question.includes('EXAMPLE-001'));assert(!JSON.stringify(lastRequest).includes('마스킹된신청인'));
  assert.equal(await page.locator('.public-data-card').count(),7);assert.equal(uploaded.data.lawEvidence.length,4);
  assert((await page.locator('.application-identification').innerText()).includes('EXAMPLE-001'));
  record({test:'업로드 확인 후 실제 분석',http:uploaded.http,seconds:uploaded.seconds,cards:7,lawArticles:uploaded.data.lawEvidence.map(h=>h.article),editedContentUsed:true,receipt:uploaded.data.application.receiptNumber,summary:uploaded.data.analysis.summary,requestedInfo:uploaded.data.analysis.requestedInfo,checks:uploaded.data.analysis.checks});
  const before=asks,downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'샘플 Excel 생성'}).click();const downloaded=await downloadWait;await downloaded.saveAs(dir+'/downloaded-sample.xlsx');assert.equal(await downloaded.failure(),null);assert.equal(asks,before);
  await writeFile(dir+'/download-expected.json',JSON.stringify({headers:uploaded.data.analysis.columns.map(c=>c.name),application:uploaded.data.application}));record({test:'Excel 다운로드',success:true,additionalAIRequests:asks-before});
  await page.locator('.public-data-law-evidence details').first().locator('summary').click();await page.locator('#application-upload').screenshot({path:dir+'/upload-screen.png'});
  await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);record({test:'휴대폰 너비',horizontalOverflow:false});await page.setViewportSize({width:1440,height:1000});
  await new Promise(r=>setTimeout(r,20000));
  await page.locator('#application-input-method').selectOption('manual');await page.locator('#ai-question').fill('경주시 문화재 현황을 주소와 관리부서까지 받고 싶습니다.');
  const manual=await analyze(page.locator('#ai-form button[type=submit]'),'직접 입력');assert.equal(await page.locator('.public-data-card').count(),7);assert.equal(manual.data.lawEvidence.length,4);assert(!manual.data.application);assert.equal(await page.locator('.application-identification').count(),0);record({test:'직접 입력',http:manual.http,seconds:manual.seconds,cards:7,lawArticles:manual.data.lawEvidence.map(h=>h.article),noStaleReceipt:true});
  const directDownload=page.waitForEvent('download');await page.getByRole('button',{name:'샘플 Excel 생성'}).click();await(await directDownload).saveAs(dir+'/manual-sample.xlsx');
  await new Promise(r=>setTimeout(r,20000));
  for(const [mode,q] of [['chat','3 더하기 5는 얼마인가요?'],['rag','세션1 평가항목을 알려주세요.']]){await page.locator('#ai-mode').selectOption(mode);await page.locator('#ai-question').fill(q);const r=await analyze(page.locator('#ai-form button[type=submit]'),mode);assert(r.data.answer?.trim());record({test:mode,http:r.http,seconds:r.seconds,answer:r.data.answer,sources:r.data.sources,debugVisible:await page.locator('#rag-debug').evaluate(e=>!e.hidden)});await new Promise(r=>setTimeout(r,15000));}
}finally{await browser.close();await writeFile(dir+'/test-results.json',safe(results));}

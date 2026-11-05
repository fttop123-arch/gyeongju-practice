// 합성 응답만 사용합니다. 실제 AI/.env/업무 원문에 접근하지 않습니다.
import test from 'node:test';import assert from 'node:assert/strict';
import {generateRegistrationMetadata,validateRegistrationCandidates} from './registration-metadata.mjs';
import {getLlmConfiguration} from './llm-providers.mjs';
import {registrationAiDiagnostic,RegistrationAiError} from './registration-errors.mjs';
import {createRegistrationHandler} from './registration-api.mjs';import {practiceAuth} from './practice-auth.mjs';
import {analyzeCsv} from './dist/csv-analysis.mjs';import {registrationBatchItem,registrationAutoApply,registrationDownloadPlan} from './dist/registration-batch.mjs';
const keys=['dataName','major','minor','basis','keywords','evidence'];
const structure=analyzeCsv(new TextEncoder().encode('종류,수량\nPRIVATE_SYNTHETIC_ROW,2'),'합성생활폐기물.csv');
const config=getLlmConfiguration({LLM_PROVIDER:'hasa',LLM_MODEL:'synthetic-model',HASA_API_KEY:'synthetic-only'});
const pair={major:'환경보호',minor:'폐기물'},catalog={verified:true,entries:[pair]};
const valid={dataName:'합성생활폐기물',...pair,basis:'',keywords:['폐기물'],evidence:['dataName','major','minor','keywords'].map(field=>({field,source:'filename'})),basisRecommendation:{lawName:'폐기물관리법',reason:'합성 업무 관련 후보'}};
const reply=value=>Response.json({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]});
const omit=(...fields)=>Object.fromEntries(Object.entries(valid).filter(([k])=>!fields.includes(k)));
for(const field of keys){
 test(`필수 키 ${field} 누락: 해당 필드명만 교정 요청, 재검증 후 성공`,async()=>{
  assert.throws(()=>validateRegistrationCandidates(JSON.stringify(omit(field)),structure,{evidenceMode:'ids',recommendBasis:true,catalog}),e=>e.code==='JSON_REQUIRED_MISSING'&&JSON.stringify(e.missingFields)===JSON.stringify([field]));
  let calls=0,first;const diagnostics=[];
  const result=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,onRetry:e=>diagnostics.push(registrationAiDiagnostic(e,'synthetic-id')),fetchApi:async(url,o)=>{
   calls++;const body=JSON.parse(o.body);assert(!o.body.includes('PRIVATE_SYNTHETIC_ROW'));
   if(calls===1){first=body.messages[1].content;return reply(omit(field));}
   assert.equal(body.messages[1].content,first);assert(body.messages[0].content.includes('누락된 필수 키: '+field+'.'));assert(body.messages[0].content.includes('전체 JSON 객체'));return reply(valid);
  }});
  assert.equal(calls,2);assert.equal(result.fields.dataName,valid.dataName);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].attempt,1);assert.deepEqual(diagnostics[0].missingFields,[field]);
 });
 test(`필수 키 ${field} 재시도도 누락: 임의 보완 없이 2회에서 실패`,async()=>{let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(omit(field));}}),e=>e.code==='JSON_REQUIRED_MISSING'&&e.attempt===2&&JSON.stringify(e.missingFields)===JSON.stringify([field]));assert.equal(calls,2);});
}
test('복수 누락 필드 목록과 전체 스키마 지시, AI 추가 키/값은 재요청에 반사하지 않음',async()=>{let calls=0;await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async(url,o)=>{calls++;if(calls===1)return reply({...omit('basis','evidence'),UNTRUSTED_PRIVATE_KEY:'UNTRUSTED_PRIVATE_VALUE'});const instructions=JSON.parse(o.body).messages[0].content;assert(instructions.includes('누락된 필수 키: basis, evidence.'));assert(!instructions.includes('UNTRUSTED_PRIVATE'));return reply(valid);}});assert.equal(calls,2);});
test('정상 응답은 한 번만 호출하고 결과 유지',async()=>{let calls=0,retries=0;await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,onRetry:()=>retries++,fetchApi:async()=>{calls++;return reply(valid);}});assert.equal(calls,1);assert.equal(retries,0);});
for(const [name,value,code] of [['근거 오류',{...valid,evidence:[]},'EVIDENCE_VALIDATION_FAILED'],['없는 컬럼',{...valid,evidence:[{field:'dataName',columnIds:['col_999']}]},'UNKNOWN_CSV_COLUMN'],['자료형 오류',{...valid,keywords:'틀린형식'},'JSON_SCHEMA_INVALID'],['보유근거 조작',{...valid,basis:'미확인근거'},'BASIS_VALIDATION_FAILED']])test(`필수 키 복구 뒤 ${name}: 재검증 실패와 3회 호출 금지`,async()=>{let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(calls===1?omit('basis'):value);}}),e=>e.code===code&&e.attempt===2);assert.equal(calls,2);});
for(const [name,value] of [['근거',{...valid,evidence:[]}],['컬럼',{...valid,evidence:[{field:'dataName',columnIds:['col_999']}]}],['분류',{...valid,minor:'없는분류'}]])test(`${name} 재시도 뒤 필수 키 누락: 공유 예산2회`,async()=>{let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(calls===1?value:omit('keywords'));}}),e=>e.code==='JSON_REQUIRED_MISSING'&&e.attempt===2);assert.equal(calls,2);});
test('필수 키 복구 뒤 법률 재추천도 세 번째 호출 불가',async()=>{let calls=0;const r=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(calls===1?omit('basis'):{...valid,basisRecommendation:{lawName:'',reason:''}});}});assert.equal(calls,2);assert.equal(r.basisRecommendationState,'failed');});
test('45초 전체 제한 만료 후 공급자 재호출 금지',async()=>{const old=AbortSignal.timeout,c=new AbortController();AbortSignal.timeout=ms=>{assert.equal(ms,45000);return c.signal;};let calls=0;try{await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;c.abort(new DOMException('synthetic','TimeoutError'));return reply(omit('keywords'));}}),e=>e.code==='AI_TIMEOUT'&&e.attempt===1);assert.equal(calls,1);}finally{AbortSignal.timeout=old;}});
test('진단은 허용 필드명·1/2 호출 차수만 출력, 임의 필드명/값/원문 제거',()=>{const e=new RegistrationAiError('JSON_REQUIRED_MISSING','candidate_validation');e.missingFields=['basis','PRIVATE_KEY','evidence','basis'];e.attempt=2;e.raw='PRIVATE_RAW';e.stack='PRIVATE_STACK';assert.deepEqual(registrationAiDiagnostic(e,'test-id'),{stage:'candidate_validation',code:'JSON_REQUIRED_MISSING',providerStatus:null,finishReason:null,requestId:'test-id',attempt:2,missingFields:['basis','evidence']});e.attempt=99;assert(!Object.hasOwn(registrationAiDiagnostic(e,'test-id'),'attempt'));});
test('3개 CSV: 성공2건 보존, 실패 파일만 재시도/수동 재생성, Excel 23열 유지',async()=>{
 const origin='https://required-retry.example',env={PRACTICE_ACCESS_CODE:'synthetic-password',HASA_API_KEY:'synthetic-key',LLM_PROVIDER:'hasa',LLM_MODEL:'synthetic-model',HUB_CONNECTION_VERIFIED:'true'};
 const login=await practiceAuth.handle(new Request(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accessCode:env.PRACTICE_ACCESS_CODE})}),env),cookie=login.headers.get('set-cookie').split(';')[0];const counts=new Map();let recover=false;const logs=[],old=console.warn;console.warn=s=>logs.push(JSON.parse(s));
 const handler=createRegistrationHandler(async(url,o)=>{const input=JSON.parse(JSON.parse(o.body).messages[1].content),name=input.fileName;counts.set(name,(counts.get(name)||0)+1);const v={...valid,dataName:name.slice(0,-4)};if(name==='합성3.csv'&&!recover)delete v.basis;return reply(v);},async()=>catalog);
 const req=(path,body)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const items=Array.from({length:3},(_,i)=>{const item=registrationBatchItem({name:`합성${i+1}.csv`},String(i));item.structure={...structure,fileName:item.file.name};return item;});
 const run=async item=>{const response=await handler(req('/api/registration-metadata',{structure:item.structure}),env),body=await response.json();if(response.ok)registrationAutoApply(item,body,catalog);else{item.status='error';item.error=body.error;}};
 try{await run(items[0]);await run(items[1]);const snapshots=items.slice(0,2).map(i=>JSON.stringify(i));await run(items[2]);assert.deepEqual([...counts.values()],[1,1,2]);assert.deepEqual(items.slice(0,2).map(i=>JSON.stringify(i)),snapshots);assert.equal(registrationDownloadPlan(items,catalog).included.length,2);assert.deepEqual(logs.map(e=>e.attempt),[1,2]);assert(logs.every(e=>JSON.stringify(e.missingFields)==='["basis"]'));assert.equal(logs[0].requestId,logs[1].requestId);assert(!JSON.stringify(logs).includes('합성'));
 recover=true;await run(items[2]);assert.deepEqual([...counts.values()],[1,1,3]);assert.deepEqual(items.slice(0,2).map(i=>JSON.stringify(i)),snapshots);const records=registrationDownloadPlan(items,catalog).included;assert.equal(records.length,3);const response=await handler(req('/api/registration-excel',{kind:'final',records}),env);assert.equal(response.status,200);const xml=new TextDecoder().decode(await response.arrayBuffer());assert(xml.includes('A1:W4'));assert.equal([...xml.matchAll(/<c r="/g)].length,92);
 }finally{console.warn=old;}
});

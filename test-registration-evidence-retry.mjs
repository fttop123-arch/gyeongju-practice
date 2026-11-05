// 합성 응답만 사용합니다. 실제 API/.env/조직도/RPA 접근 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRegistrationMetadata,validateRegistrationCandidates} from './registration-metadata.mjs';
import {getLlmConfiguration} from './llm-providers.mjs';
import {createRegistrationHandler} from './registration-api.mjs';
import {practiceAuth} from './practice-auth.mjs';
import {analyzeCsv} from './dist/csv-analysis.mjs';
import {registrationBatchItem,registrationAutoApply,registrationDownloadPlan,createRegistrationQueue} from './dist/registration-batch.mjs';
const structure=analyzeCsv(new TextEncoder().encode('시설명,수량\nPRIVATE_SYNTHETIC_CELL,2'),'합성시설.csv');
const config=getLlmConfiguration({LLM_PROVIDER:'hasa',LLM_MODEL:'synthetic-model',HASA_API_KEY:'synthetic-evidence-key'});
const pair={major:'교통및물류',minor:'도로'},catalog={verified:true,entries:[pair]};
const valid={dataName:'합성시설',keywords:['시설'],...pair,basis:'',basisRecommendation:{lawName:'주차장법',reason:'합성 업무 관련 법률 후보'},evidence:['dataName','keywords','major','minor'].map(field=>({field,source:'filename'}))};
const reply=value=>Response.json({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]});
const variants=[
 ['INVALID_EVIDENCE_LIST',{...valid,evidence:{}}],
 ['DESCRIPTION_SOURCE',{...valid,evidence:[{field:'dataName',source:'description'}]}],
 ['INVALID_FILENAME_EVIDENCE',{...valid,evidence:[{field:'dataName',source:'filename',columnIds:['col_001']}]}],
 ['DATA_NAME_MISMATCH',{...valid,dataName:'원본과다름'}],
 ['INVALID_SOURCE',{...valid,evidence:[{field:'dataName',source:'DO_NOT_REFLECT_PRIVATE_MARKER'}]}],
 ['INVALID_COLUMN_EVIDENCE',{...valid,evidence:[{field:'dataName',columns:['시설명']}]}],
 ['MISSING_FIELD_EVIDENCE',{...valid,evidence:[]}]
];
for(const [reason,value] of variants){
 test(`근거 ${reason}: 규칙 유지, 실패 유형을 반영한 1회 재시도로 복구`,async()=>{
  assert.throws(()=>validateRegistrationCandidates(JSON.stringify(value),structure,{evidenceMode:'ids',catalog,recommendBasis:true}),e=>e.code==='EVIDENCE_VALIDATION_FAILED'&&e.validationReason===reason);
  let calls=0,firstInput;
  const result=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async(url,options)=>{
   calls++;const body=JSON.parse(options.body);assert(!options.body.includes('PRIVATE_SYNTHETIC_CELL'));assert(!options.body.includes('DO_NOT_REFLECT_PRIVATE_MARKER'));
   if(calls===1){firstInput=body.messages[1].content;return reply(value);}
   assert.equal(calls,2);assert.equal(body.messages[1].content,firstInput);assert(body.messages[0].content.includes(reason));assert(body.messages[0].content.includes('EVIDENCE_VALIDATION_FAILED'));return reply(valid);
  }});
  assert.equal(calls,2);assert.equal(result.fields.dataName,valid.dataName);assert.equal(result.evidence.length,4);
 });
 test(`근거 ${reason}: 재생성도 검증 실패면 2회에서 중단`,async()=>{
  let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(value);}}),e=>e.code==='EVIDENCE_VALIDATION_FAILED');assert.equal(calls,2);
 });
}
test('첫 응답 정상은 호출1회, 기존 결과 그대로',async()=>{let calls=0;const r=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(valid);}});assert.equal(calls,1);assert.equal(r.fields.dataName,valid.dataName);});
for(const [name,second,code] of [['JSON 오류','bad-json','JSON_PARSE_FAILED'],['허위 보유근거',{...valid,basis:'확인되지 않은 근거'},'BASIS_VALIDATION_FAILED'],['알 수 없는 컬럼',{...valid,evidence:[{field:'dataName',columnIds:['col_999']}]},'UNKNOWN_CSV_COLUMN']])test(`근거 재시도 뒤 ${name}: 추가 호출/검증 우회 없음`,async()=>{let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return calls===1?reply({...valid,evidence:[]}):typeof second==='string'?Response.json({choices:[{message:{content:second}}]}):reply(second);}}),e=>e.code===code);assert.equal(calls,2);});
test('분류 재시도에서 근거 실패: 공유 예산2회, 세 번째 호출 금지',async()=>{let calls=0;await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(calls===1?{...valid,minor:'목록에없음'}:{...valid,evidence:[]});}}),e=>e.code==='EVIDENCE_VALIDATION_FAILED');assert.equal(calls,2);});
test('근거 복구 후 법률 후보가 없어도 세 번째 호출 금지',async()=>{let calls=0;const r=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;return reply(calls===1?{...valid,evidence:[]}:{...valid,basisRecommendation:{lawName:'',reason:''}});}});assert.equal(calls,2);assert.equal(r.basisRecommendationState,'failed');});
test('근거 실패 후 전체45초 만료: 두 번째 공급자 호출 차단',async()=>{const old=AbortSignal.timeout,c=new AbortController();AbortSignal.timeout=ms=>{assert.equal(ms,45000);return c.signal;};let calls=0;try{await assert.rejects(()=>generateRegistrationMetadata({structure,config,catalog,recommendBasis:true,fetchApi:async()=>{calls++;c.abort(new DOMException('synthetic','TimeoutError'));return reply({...valid,evidence:[]});}}),e=>e.code==='AI_TIMEOUT');assert.equal(calls,1);}finally{AbortSignal.timeout=old;}});
test('4개 CSV: 실패 파일만 1회 재시도, 성공3건 보존, 수동 재생성으로 4건 Excel 복구',async()=>{
 const env={PRACTICE_ACCESS_CODE:'synthetic-batch-password',HASA_API_KEY:'synthetic-batch-key',LLM_PROVIDER:'hasa',LLM_MODEL:'synthetic-model',HUB_CONNECTION_VERIFIED:'true'},origin='https://synthetic-retry.example';
 const login=await practiceAuth.handle(new Request(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accessCode:env.PRACTICE_ACCESS_CODE})}),env);const cookie=login.headers.get('set-cookie').split(';')[0];
 const counts=new Map();let recover=false;const logs=[],oldWarn=console.warn;console.warn=s=>logs.push(s);
 const api=createRegistrationHandler(async(url,options)=>{const input=JSON.parse(JSON.parse(options.body).messages[1].content),name=input.fileName;counts.set(name,(counts.get(name)||0)+1);return reply({...valid,dataName:name.replace(/\.csv$/i,''),evidence:name==='합성시설2.csv'&&!recover?[]:valid.evidence});},async()=>catalog);
 const request=(path,body)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const items=Array.from({length:4},(_,i)=>{const file={name:`합성시설${i+1}.csv`},item=registrationBatchItem(file,`item-${i}`);item.structure={...structure,fileName:file.name};return item;});
 const processItem=async item=>{const r=await api(request('/api/registration-metadata',{structure:item.structure}),env),body=await r.json();if(r.ok)registrationAutoApply(item,body,catalog);else{item.error=body.error;item.status='error';}};
 try{
  await createRegistrationQueue({interval:0}).run(items,processItem);
  assert.deepEqual([...counts.values()],[1,2,1,1]);assert.equal(items[1].status,'error');assert.equal(logs.length,1);assert.equal(JSON.parse(logs[0]).code,'EVIDENCE_VALIDATION_FAILED');
  assert.equal(registrationDownloadPlan(items,catalog).included.length,3);
  const successful=items.filter(i=>i!==items[1]),snapshots=successful.map(i=>JSON.stringify(i));
  recover=true;await processItem(items[1]);assert.equal(counts.get('합성시설2.csv'),3);assert.deepEqual(successful.map(i=>JSON.stringify(i)),snapshots);
  const plan=registrationDownloadPlan(items,catalog);assert.equal(plan.included.length,4);assert.equal(plan.excluded.length,0);
  const excel=await api(request('/api/registration-excel',{kind:'final',records:plan.included}),env);assert.equal(excel.status,200);const xml=new TextDecoder().decode(await excel.arrayBuffer());assert(xml.includes('A1:W5'));assert.equal([...xml.matchAll(/<c r="/g)].length,115);
 }finally{console.warn=oldWarn;}
});

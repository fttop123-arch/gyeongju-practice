// 오류 원인·사용자 안내·진단 허용목록 검증. 실제 키/CSV/AI 호출 없음.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRegistrationHandler as createHandler} from './registration-api.mjs';
const createRegistrationHandler=(fetchApi)=>createHandler(fetchApi,async()=>({verified:true,entries:[]}));
import {practiceAuth} from './practice-auth.mjs';
import {REGISTRATION_AI_ERRORS,RegistrationAiError,registrationAiDiagnostic} from './registration-errors.mjs';
import {validateRegistrationCandidates} from './registration-metadata.mjs';
const env={PRACTICE_ACCESS_CODE:'test-error-access-only',HASA_API_KEY:'test-error-api-only',LLM_PROVIDER:'hasa',LLM_MODEL:'exaone-4.0-32b',HASA_BASE_URL:'https://open.hasa.re.kr/v1',HUB_CONNECTION_VERIFIED:'true'};
const origin='https://synthetic-errors.test';
const structure={fileName:'synthetic-error.csv',fileSize:40,encoding:'utf-8',delimiter:',',rowCount:1,columnCount:1,columns:[{name:'가상컬럼',type:'문자열',missingCount:0,missingRate:0}]};
const candidate={dataName:'synthetic-error',keywords:['가상'],major:'',minor:'',basis:'',evidence:[{field:'dataName',columnIds:['col_001']},{field:'keywords',columnIds:['col_001']}]};
const reply=(value,reason='stop')=>Response.json({choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)},finish_reason:reason}]});
const login=await practiceAuth.handle(new Request(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accessCode:env.PRACTICE_ACCESS_CODE})}),env);
const cookie=login.headers.get('set-cookie').split(';')[0];
const request=()=>new Request(origin+'/api/registration-metadata',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({structure,consent:true})});
test('정상 응답: 기존 결과 형식 유지, 오류 로그 없음',async()=>{const messages=[],old=console.warn;console.warn=x=>messages.push(x);try{const r=await createRegistrationHandler(async()=>reply(candidate))(request(),env);assert.equal(r.status,200);assert.equal((await r.json()).fields.dataName,candidate.dataName);assert.equal(messages.length,0);}finally{console.warn=old;}});
const cases=[
 ['공급자 인증 실패','UPSTREAM_AUTH_FAILED',async()=>new Response('upstream-private-marker',{status:401}),'provider_response',401,null],
 ['모델 권한 오류','UPSTREAM_FORBIDDEN',async()=>new Response('{}',{status:403}),'provider_response',403,null],
 ['모델 경로 오류','UPSTREAM_NOT_FOUND',async()=>new Response('{}',{status:404}),'provider_response',404,null],
 ['공급자 사용 한도','UPSTREAM_RATE_LIMIT',async()=>new Response('{}',{status:429}),'provider_response',429,null],
 ['공급자 장애','UPSTREAM_HTTP_ERROR',async()=>new Response('{}',{status:503}),'provider_response',503,null],
 ['네트워크 오류','NETWORK_ERROR',async()=>{throw new TypeError('private-network-marker')},'provider_request',null,null],
 ['응답 시간 초과','AI_TIMEOUT',async()=>{throw new DOMException('private-timeout-marker','TimeoutError')},'provider_request',null,null],
 ['응답 본문 읽기 시간 초과','AI_TIMEOUT',async()=>({status:200,ok:true,clone(){return {async json(){throw new DOMException('private-timeout-marker','TimeoutError');}};}}),'provider_response',200,null],
 ['응답 본문 전송 중 네트워크 오류','NETWORK_ERROR',async()=>({status:200,ok:true,clone(){return {async json(){throw new TypeError('private-network-marker');}};}}),'provider_response',200,null],
 ['응답 내용 없음','AI_EMPTY_RESPONSE',async()=>reply(''),'provider_response',200,'stop'],
 ['응답 경로 없음','AI_EMPTY_RESPONSE',async()=>Response.json({choices:[]}),'provider_response',200,null],
 ['공급자 응답 형식 오류','UPSTREAM_RESPONSE_INVALID',async()=>new Response('not-upstream-json'),'provider_response',200,null],
 ['JSON 파싱 오류','JSON_PARSE_FAILED',async()=>reply('invalid-json'),'candidate_parse',200,'stop'],
 ['출력 길이 종료와 JSON 오류','JSON_PARSE_FAILED',async()=>reply('{','length'),'candidate_parse',200,'length'],
 ['JSON 필수항목 누락','JSON_REQUIRED_MISSING',async()=>reply({...candidate,keywords:undefined}),'candidate_validation',200,'stop'],
 ['JSON 자료형 오류','JSON_SCHEMA_INVALID',async()=>reply({...candidate,keywords:'가상'}),'candidate_validation',200,'stop'],
 ['실제 CSV에 없는 컬럼','UNKNOWN_CSV_COLUMN',async()=>reply({...candidate,evidence:[{field:'dataName',columnIds:['col_999']}]}),'candidate_validation',200,'stop'],
 ['보유근거 검증 실패','BASIS_VALIDATION_FAILED',async()=>reply({...candidate,basis:'unverified-basis-marker'}),'candidate_validation',200,'stop'],
 ['후보 근거 누락','EVIDENCE_VALIDATION_FAILED',async()=>reply({...candidate,evidence:[]}),'candidate_validation',200,'stop'],
 ['예상하지 못한 오류','UNEXPECTED_ERROR',async()=>{const e=new Error('private-unexpected-marker');e.code='forged-code';e.stage='private-stage';throw e;},'provider_request',null,null],
 ['종료 사유 허용목록','AI_EMPTY_RESPONSE',async()=>reply('','private-finish-marker'),'provider_response',200,null],
];
for(const [name,code,fetchApi,stage,providerStatus,finishReason] of cases)test(name+': 코드/안내/안전 로그',async()=>{
 const logs=[],old=console.warn;console.warn=x=>logs.push(x);
 try{
  const response=await createRegistrationHandler(fetchApi)(request(),env),body=await response.json();
  assert.equal(response.status,REGISTRATION_AI_ERRORS[code][0]);assert.equal(body.code,code);assert(body.error.startsWith(REGISTRATION_AI_ERRORS[code][1]));assert.match(body.requestId,/^[a-f0-9-]{36}$/);
  assert.equal(logs.length,1);const log=JSON.parse(logs[0]);assert.deepEqual(Object.keys(log).sort(),['stage','code','providerStatus','finishReason','requestId'].sort());assert.deepEqual(log,{stage,code,providerStatus,finishReason,requestId:body.requestId});
  for(const marker of [env.PRACTICE_ACCESS_CODE,env.HASA_API_KEY,cookie,structure.fileName,'가상컬럼','upstream-private-marker','private-network-marker','private-timeout-marker','unverified-basis-marker','private-unexpected-marker','private-finish-marker'])assert(!JSON.stringify({log,body}).includes(marker),'private details leaked');
  if(['UNKNOWN_CSV_COLUMN','BASIS_VALIDATION_FAILED','JSON_PARSE_FAILED','JSON_REQUIRED_MISSING'].includes(code))assert(!body.error.includes('API 키')&&!body.error.includes('서버 설정'));
 }finally{console.warn=old;}
});
test('검증 유지: 명시적 오류 코드로 거부',()=>{for(const [value,code] of [[{...candidate,basis:'확인 안 된 근거'},'BASIS_VALIDATION_FAILED'],[{...candidate,evidence:[{field:'keywords',columnIds:['col_999']}]},'UNKNOWN_CSV_COLUMN'],[{},'JSON_REQUIRED_MISSING']])assert.throws(()=>validateRegistrationCandidates(JSON.stringify(value),structure,{evidenceMode:'ids'}),e=>e.code===code);});
test('임의 오류 메타데이터/비밀 종료사유는 로그에서 제외',()=>{assert.deepEqual(registrationAiDiagnostic({code:'UNKNOWN_CSV_COLUMN',stage:'candidate_validation',providerStatus:401,finishReason:'stop'},'synthetic-id'),{stage:'generate',code:'UNEXPECTED_ERROR',providerStatus:null,finishReason:null,requestId:'synthetic-id'});const e=new RegistrationAiError('JSON_PARSE_FAILED','private-stage',{providerStatus:'200',finishReason:'private-data'});assert.deepEqual(registrationAiDiagnostic(e,'synthetic-id'),{stage:'generate',code:'JSON_PARSE_FAILED',providerStatus:null,finishReason:null,requestId:'synthetic-id'});});
test('요청별 식별번호는 서로 다름',async()=>{const ids=[],old=console.warn;console.warn=()=>{};try{const api=createRegistrationHandler(async()=>reply('bad'));for(let i=0;i<2;i++)ids.push((await(await api(request(),env)).json()).requestId);assert.notEqual(ids[0],ids[1]);}finally{console.warn=old;}});

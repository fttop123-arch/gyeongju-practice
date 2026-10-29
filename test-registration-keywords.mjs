import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRegistrationKeywords,registrationInitialFields} from './dist/registration-schema.mjs';
import {validateRegistrationCandidates,generateRegistrationMetadata} from './registration-metadata.mjs';
import {analyzeCsv} from './dist/csv-analysis.mjs';import {loadRegistrationCatalog} from './registration-catalog.mjs';import {createRegistrationExcel} from './registration-excel.mjs';
const catalog=await loadRegistrationCatalog();const structure=analyzeCsv(new TextEncoder().encode('명칭,운영시간\n가상,09시'),'가상시 샘플 관광안내소 운영 현황.csv');
const candidate={dataName:structure.fileName.slice(0,-4),keywords:['관광안내소','관광정보',' 운영시간 ','관광안내소'],major:'문화체육관광',minor:'관광',basis:'',evidence:[{field:'dataName',source:'filename'},{field:'keywords',source:'filename'},{field:'keywords',columnIds:['col_002']},{field:'major',source:'filename'},{field:'minor',source:'filename'}]};
test('키워드: 복합명사·내부 공백 제거, 쉼표 공백·빈값·동일 키워드 제거',()=>{assert.equal(normalizeRegistrationKeywords(' 공영 주차장 , 주차 면수, 공영 주차장,,운영시간 '),'공영주차장,주차면수,운영시간');assert.equal(normalizeRegistrationKeywords(['시설','시설','운영 시간']),'시설,운영시간');});
test('키워드: 파일명 근거 허용, 실제 컬럼 ID 검증과 거짓 혼합 근거 거부 유지',()=>{const r=validateRegistrationCandidates(JSON.stringify(candidate),structure,{evidenceMode:'ids',catalog});assert.equal(r.fields.keywords,'관광안내소,관광정보,운영시간');for(const entry of [{field:'keywords',source:'filename',columnIds:['col_999']},{field:'keywords',columnIds:['col_999']}])assert.throws(()=>validateRegistrationCandidates(JSON.stringify({...candidate,evidence:[...candidate.evidence,entry]}),structure,{evidenceMode:'ids',catalog}));});
test('키워드: 업무 검색 품질 지시·원본 미전송·모의 결과 정규화',async()=>{let called=0;const r=await generateRegistrationMetadata({structure,catalog,config:{model:'synthetic',provider:{async generate(p){called++;assert.match(p.instructions,/복합명사/);assert.match(p.instructions,/3~5개/);assert.match(p.instructions,/중복/);assert.match(p.instructions,/파일명·dataName/);assert(!JSON.parse(p.question).rows);return JSON.stringify(candidate);}}}});assert.equal(called,1);assert.equal(r.fields.keywords,'관광안내소,관광정보,운영시간');});
test('Excel: 담당자 수정 키워드가 D열, H/I/J와 23열 계약 유지',()=>{const fields={...registrationInitialFields(),dataName:candidate.dataName,keywords:'공영 주차장 , 운영 시간, 공영 주차장',major:candidate.major,minor:candidate.minor,basis:'담당자 확인용 합성 근거'};const xml=new TextDecoder().decode(createRegistrationExcel([{structure,fields,reviewed:true,basisConfirmed:true}],{catalog}));assert.match(xml,/<c r="D2"[^>]*><is><t[^>]*>공영주차장,운영시간<\/t>/);assert.match(xml,/A1:W2/);assert.match(xml,/<c r="H2"[^>]*><is><t[^>]*>문화체육관광/);assert.match(xml,/<c r="I2"[^>]*><is><t[^>]*>관광/);});
const whitespaceCases=[
 ['공공자전거,대여소 현황,거치대수,운영여부','공공자전거,대여소현황,거치대수,운영여부'],
 ['  공공자전거 , 대여소 현황  ,거치대수 ','공공자전거,대여소현황,거치대수'],
 ['공공\t자전거,대여소\n현황,거치\r\n대수','공공자전거,대여소현황,거치대수'],
 ['대여소 현황,대여소현황,, ,\t,대여소\n현황','대여소현황'],
 ['공공자전거,거치대수','공공자전거,거치대수'],
 ['\u3000공공\u00a0자전거\uFEFF,운영\v여부\f','공공자전거,운영여부'],
 ['', ''],[' , \t\n, ', '']
];
for(const [input,expected] of whitespaceCases)test(`포털 공백 금지 정규화 ${JSON.stringify(input)}`,()=>{assert.equal(normalizeRegistrationKeywords(input),expected);assert(!/\s/u.test(normalizeRegistrationKeywords(input)));});
test('AI 응답: 탭/줄바꿈/정규화 후 중복·빈 항목 정리, 기존 한도 유지',()=>{
 const result=validateRegistrationCandidates(JSON.stringify({...candidate,keywords:['공공 자전거','대여소\t현황','대여소현황','\n ','운영\n여부']}),structure,{evidenceMode:'ids',catalog});assert.equal(result.fields.keywords,'공공자전거,대여소현황,운영여부');
 for(const keywords of [['\t','\n'],Array(16).fill('시설'),['가'.repeat(101)],['시설,운영']])assert.throws(()=>validateRegistrationCandidates(JSON.stringify({...candidate,keywords}),structure,{evidenceMode:'ids',catalog}));
});
for(const count of [1,10])test(`서버 Excel ${count}건: 공백 제거 후 D열·23열 구조·H/I/J 보존`,()=>{
 const records=Array.from({length:count},(_,n)=>{const name=`합성 공공자전거${n+1}`;return {structure:{...structure,fileName:name+'.csv'},fields:{...registrationInitialFields(),dataName:name,keywords:' 공공자전거,대여소\t현황,거치\n대수,대여소 현황, ,운영\v여부',major:candidate.major,minor:candidate.minor,basis:'담당자 확인 합성 근거'}};});
 const xml=new TextDecoder().decode(createRegistrationExcel(records,{catalog}));assert(xml.includes(`A1:W${count+1}`));assert.equal([...xml.matchAll(/<c r="/g)].length,(count+1)*23);
 for(let row=2;row<count+2;row++){assert(xml.includes(`r="D${row}" t="inlineStr"><is><t xml:space="preserve">공공자전거,대여소현황,거치대수,운영여부</t>`));assert(xml.includes(`r="J${row}" t="inlineStr"><is><t xml:space="preserve">담당자 확인 합성 근거</t>`));}
});

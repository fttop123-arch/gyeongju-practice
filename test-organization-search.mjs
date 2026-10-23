import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {recommendOrganization} from './organization-search.mjs';
import {createApiHandler} from './api-handler.mjs';
const employees=[
 {department:'가상 교통행정과',team:'가상 주차팀',name:'가상담당자A',phone:'000-0000',duties:'공영주차장 조성 및 관리, 주차시설 관리',sortOrder:'2'},
 {department:'가상 교통행정과',team:'가상 주차팀',name:'가상담당자B',phone:'000-0001',duties:'교통시설 및 주차장 통계',sortOrder:'1'},
 {department:'가상 교통행정과',team:'가상 주차팀',name:'가상담당자C',phone:'',duties:'서무, 행정 전반',sortOrder:'0'},
 {department:'가상 환경과',team:'가상 폐기물팀',name:'가상담당자D',phone:'000-0002',duties:'생활폐기물 수거 및 쓰레기 처리',sortOrder:'1'}
];
const organization={employees,updatedAt:'가상 테스트'};
const compoundFixture={employees:[{department:'가상부서',team:'가상팀',name:'가상시스템담당',phone:'',duties:'새올 행정시스템 관리'},{department:'가상부서',team:'가상팀',name:'가상녹지담당',phone:'',duties:'가로수 조성 및 관리'}]};
for(const [query,term] of [['새올담당자','새올'],['새올담당자는 누구인가요','새올'],['경주시 가로수길 정보','가로수']]){const r=recommendOrganization({question:query,organization:compoundFixture});assert(r.candidates[0]?.matches.some(m=>m.keyword===term&&m.fields.includes('담당업무')));}
const question='경주시 공영주차장 위치 및 주차면수 데이터';
const analysis={summary:'공영주차장 제공 신청',requestedInfo:['주차장 현황'],departmentData:['주차장 관리'],columns:[{name:'주차면수',meaning:'면수',example:'가상 10',notes:'확인 필요'}],checks:['확인 필요'],cautions:['기관 검토 필요'],departmentDraft:'검토 요청',legalEvidence:[]};
const ranked=recommendOrganization({question,analysis,organization});assert.equal(ranked.candidates[0].name,'가상담당자A');assert(ranked.candidates.findIndex(c=>c.name==='가상담당자C')>ranked.candidates.findIndex(c=>c.name==='가상담당자B'));assert(ranked.candidates[0].matches.some(m=>m.keyword==='공영주차장'));assert.equal(recommendOrganization({question:'우주망원경 스펙트럼',analysis,organization}).candidates.length,0);assert.equal(recommendOrganization({question,organization:null}).status,'unavailable');assert.equal(recommendOrganization({question:'공공데이터 자료 요청',organization}).candidates.length,0);assert.equal(recommendOrganization({question,organization:{employees:[...employees,...employees]}}).candidates.length,3);assert.equal(recommendOrganization({question,organization,limit:1}).candidates.length,1);
const law=JSON.parse(await readFile(new URL('./data/public-data-law-index.json',import.meta.url)));const payloads=[];
const fetchApi=async(url,opts)=>{const body=JSON.parse(opts.body);payloads.push(body);if(url.endsWith('/embeddings'))return Response.json({data:[{index:0,embedding:law.chunks[0].vector}]});return Response.json({choices:[{message:{content:JSON.stringify(analysis)}}]});};
const env={LLM_PROVIDER:'hasa',LLM_MODEL:'exaone-4.0-32b',HASA_BASE_URL:'https://open.hasa.re.kr/v1',HASA_API_KEY:'test-only-key',PRACTICE_ACCESS_CODE:'test-only-code',HUB_CONNECTION_VERIFIED:'true'};
const handler=createApiHandler(fetchApi,null,law,organization);
const request=()=>new Request('https://test.invalid/api/ask',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({question,mode:'public-data',accessCode:env.PRACTICE_ACCESS_CODE})});
const response=await handler(request(),env);assert.equal(response.status,200);const result=await response.json();assert(result.analysis);assert.equal(result.organizationRecommendation.candidates[0].name,'가상담당자A');assert.equal(payloads.length,2);assert(!JSON.stringify(payloads).includes('가상담당자'));assert(!JSON.stringify(payloads).includes('000-0000'));
const bad=await handler(new Request('https://test.invalid/api/ask',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({question,mode:'public-data',accessCode:'wrong'})}),env);assert.equal(bad.status,401);
await mkdir('../gyeongju-debug-package/organization',{recursive:true});await writeFile('../gyeongju-debug-package/organization/response.json',JSON.stringify(result));
console.log('PASS: 부분일치·복수 키워드·담당업무 우선·무관 질문·빈 데이터·중복·상한·인증·기존 분석 연결');console.log('PASS: 조직도 검색 추가 API 0회 / 이름·전화·조직도 내용의 외부 전달 없음 (모의 API 검사)');

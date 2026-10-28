import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {registrationCandidatePatch,registrationInitialFields} from './dist/registration-schema.mjs';
import {createRegistrationExcel} from './registration-excel.mjs';import {analyzeCsv} from './dist/csv-analysis.mjs';
const catalog={verified:true,entries:[{major:'합성대',minor:'합성중'}]};
const candidate={fields:{dataName:'합성자료',keywords:'시설명, 면수',major:'합성대',minor:'합성중',basis:''},basisRecommendation:{lawName:'합성법',verification:{state:'unverified'}}};
test('일괄 적용: 데이터명·키워드·분류·미검증 법률 후보 한 번에 적용',()=>{const {patch}=registrationCandidatePatch(candidate,catalog,{});assert.deepEqual(patch,{dataName:'합성자료',keywords:'시설명,면수',major:'합성대',minor:'합성중',basis:'합성법'});});
test('담당자 직접 수정한 필드는 기본적으로 보존',()=>{const {patch,skipped}=registrationCandidatePatch(candidate,catalog,{keywords:'직접 입력',basis:'직접 근거'},['keywords','basis']);assert(!Object.hasOwn(patch,'keywords'));assert(!Object.hasOwn(patch,'basis'));assert.deepEqual(skipped,['keywords','basis']);});
test('분류는 한 쌍으로 적용: 대분류나 중분류를 수정했다면 둘 다 보존',()=>{for(const key of ['major','minor']){const {patch}=registrationCandidatePatch(candidate,catalog,{major:'직접 선택 대분류',minor:'직접 선택 중분류'},[key]);assert(!Object.hasOwn(patch,'major'));assert(!Object.hasOwn(patch,'minor'));}});
test('명시적 덮어쓰기 선택 때만 담당자 수정값 교체 가능',()=>{const {patch,skipped}=registrationCandidatePatch(candidate,catalog,{},['keywords','major','minor','basis'],true);assert.equal(patch.basis,'합성법');assert.equal(patch.keywords,'시설명,면수');assert.equal(patch.major,'합성대');assert.equal(skipped.length,0);});
test('잘못된 분류·법률명 불일치는 덮어쓰기 옵션으로도 적용 불가',()=>{const c={...candidate,fields:{...candidate.fields,minor:'없는분류'},basisRecommendation:{lawName:'없는법',verification:{state:'not_found'}}};const {patch}=registrationCandidatePatch(c,catalog,{},[],true);assert(!Object.hasOwn(patch,'major'));assert(!Object.hasOwn(patch,'minor'));assert(!Object.hasOwn(patch,'basis'));});
test('추천이 없어도 기존 입력은 지우지 않음',()=>{assert.deepEqual(registrationCandidatePatch(null,catalog,{basis:'직접입력'}),{patch:{},skipped:[]});const {patch}=registrationCandidatePatch({fields:{},basisRecommendation:null},catalog,{basis:'직접입력'});assert.deepEqual(patch,{});});
test('기본 등록값·기타 담당자 입력은 AI 적용 대상에서 제외',()=>{const c={...candidate,fields:{...candidate.fields,cycle:'AI 임의값',language:'AI 임의값',system:'AI 임의값'}};const {patch}=registrationCandidatePatch(c,catalog,{});for(const key of ['cycle','language','collection','system','database','dataType'])assert(!Object.hasOwn(patch,key));});
test('한국어·직접등록 기본값은 K/L열에 반영, 기존 23열 유지',()=>{const structure=analyzeCsv(new TextEncoder().encode('시설명,면수\n가상시설,20'),'합성자료.csv');const record={structure,fields:{...registrationInitialFields(),...candidate.fields,keywords:'시설명,면수',basis:'담당자 확인 근거'},basisConfirmed:true,reviewed:true};const xml=new TextDecoder().decode(createRegistrationExcel([record],{catalog}));assert(xml.includes('r="K2" t="inlineStr"><is><t xml:space="preserve">한국어</t>'));assert(xml.includes('r="L2" t="inlineStr"><is><t xml:space="preserve">직접등록</t>'));assert(xml.includes('r="W2"'));assert(xml.includes('r="J2"'));assert(!xml.includes('r="X2"'));});
test('화면 계약: 파일 목록·단일 편집·자동 반영·상세 근거 접기',async()=>{const html=await readFile(new URL('./dist/index.html',import.meta.url),'utf8');assert(html.includes('id="registration-file" type="file" multiple'));assert(html.includes('id="registration-files"'));assert(html.includes('id="registration-prev"'));assert(html.includes('id="registration-next"'));assert(!html.includes('id="registration-apply"'));assert(!html.includes('id="registration-consent"'));assert(html.includes('추천 이유 보기'));assert(!html.includes('<details open'));});

test('분류 빈값: 수정 이력이 남아 있어도 추천 조합을 채움',()=>{
 for(const dirty of [[],['major'],['minor'],['major','minor']]){const {patch}=registrationCandidatePatch(candidate,catalog,{major:'',minor:''},dirty);assert.equal(patch.major,'합성대');assert.equal(patch.minor,'합성중');assert.equal(patch.basis,'합성법');}
});
test('동일 대분류만 직접 선택: 부모값은 유지하고 빈 중분류만 적용',()=>{
 const {patch,skipped}=registrationCandidatePatch(candidate,catalog,{major:'합성대',minor:''},['major','minor']);assert(!Object.hasOwn(patch,'major'));assert.equal(patch.minor,'합성중');assert(skipped.includes('major'));
});
test('다른 대분류만 직접 선택: AI 중분류를 섞지 않고 보존',()=>{
 const {patch}=registrationCandidatePatch(candidate,catalog,{major:'담당자 다른 대분류',minor:''},['major','minor']);assert(!Object.hasOwn(patch,'major'));assert(!Object.hasOwn(patch,'minor'));assert.equal(patch.basis,'합성법');
});
test('직접 선택한 중분류는 보존하고, 명시적 덮어쓰기는 허용',()=>{
 const current={major:'다른대',minor:'다른중'};const kept=registrationCandidatePatch(candidate,catalog,current,['minor']);assert(!Object.hasOwn(kept.patch,'major'));assert(!Object.hasOwn(kept.patch,'minor'));const replaced=registrationCandidatePatch(candidate,catalog,current,['major','minor'],true);assert.equal(replaced.patch.major,'합성대');assert.equal(replaced.patch.minor,'합성중');
});
test('실제 문화체육관광/관광 조합 적용 및 담당자 선택의 Excel H/I 반영',async()=>{
 const {loadRegistrationCatalog}=await import('./registration-catalog.mjs'),{writeFile}=await import('node:fs/promises');const real=await loadRegistrationCatalog();
 const suggested={...candidate,fields:{...candidate.fields,major:'문화체육관광',minor:'관광'},basisRecommendation:{lawName:'관광진흥법',verification:{state:'unverified'}}};
 const {patch}=registrationCandidatePatch(suggested,real,{major:'',minor:''},['major','minor']);assert.equal(patch.major,'문화체육관광');assert.equal(patch.minor,'관광');
 const structure=analyzeCsv(new TextEncoder().encode('시설명,방문객수\n가상관광시설,20'),'합성자료.csv');
 const make=fields=>createRegistrationExcel([{structure,fields:{...registrationInitialFields(),...patch,...fields},reviewed:true,basisConfirmed:true}],{catalog:real});
 const bytes=make({}),xml=new TextDecoder().decode(bytes);assert(xml.includes('r="H2" t="inlineStr"><is><t xml:space="preserve">문화체육관광</t>'));assert(xml.includes('r="I2" t="inlineStr"><is><t xml:space="preserve">관광</t>'));
 const changed=make({major:'교통및물류',minor:'도로'}),changedXml=new TextDecoder().decode(changed);assert(changedXml.includes('r="H2" t="inlineStr"><is><t xml:space="preserve">교통및물류</t>'));assert(changedXml.includes('r="I2" t="inlineStr"><is><t xml:space="preserve">도로</t>'));
 await writeFile('C:/Users/Owner/Documents/Codex/registration-catalog-qa/등록자료_관광분류.xlsx',bytes);await writeFile('C:/Users/Owner/Documents/Codex/registration-catalog-qa/등록자료_분류수정.xlsx',changed);
});

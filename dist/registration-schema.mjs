// RPA 입출력 계약. 최종 생성은 서버가 읽은 분류체계DB로 검증합니다.
export const REGISTRATION_HEADERS=['No','등록상태','데이터명','키워드','갱신주기','정보시스템명','데이터베이스','분류대','분류중','보유근거','데이터언어','수집유형','데이터유형','실제DB테이블명','DB테이블설명','DB컬럼수','K값','K적용컬럼추천','L값','L적용컬럼추천','데이터기준일','기존파일명','비고'];
export const REGISTRATION_FIELDS=[
 ['dataName','데이터명','AI 후보 · 실제 CSV 이름과 일치 필요'],['keywords','키워드','AI 후보 · 쉼표 앞뒤 공백 자동 정리'],['major','분류대','확인된 분류체계DB에서 선택'],['minor','분류중','확인된 분류체계DB에서 선택'],['basis','보유근거','담당자 직접 입력 · 실제 문서·규정 확인'],['cycle','갱신주기','기본값 수시 · 수정 가능'],['dataType','데이터 형태','기본값 정형데이터 · 수정 가능'],['system','정보시스템명','기본값 경주시 대표홈페이지 · 수정 가능'],['database','데이터베이스명','기본값 대표홈페이지 · 수정 가능'],['language','데이터언어','담당자 입력'],['collection','수집유형','담당자 입력'],['tableName','실제DB테이블명','담당자 입력'],['k','K값','의미·규칙 확인 전 빈값'],['kColumns','K적용컬럼추천','담당자 입력'],['l','L값','의미·규칙 확인 전 빈값'],['lColumns','L적용컬럼추천','담당자 입력'],['referenceDate','데이터기준일','담당자 입력 · YYYY-MM-DD'],['notes','비고','담당자 입력']
];
export const REGISTRATION_DEFAULTS=Object.freeze({cycle:'수시',dataType:'정형데이터',system:'경주시 대표홈페이지',database:'대표홈페이지',language:'한국어',collection:'직접등록'});
export const REGISTRATION_AI_FIELDS=Object.freeze(['dataName','keywords','major','minor','basis']);
export function registrationInitialFields(){return {...Object.fromEntries(REGISTRATION_FIELDS.map(([key])=>[key,''])),...REGISTRATION_DEFAULTS};}
// 단어 내부의 공백은 보존합니다. UI 편집 도중에는 빈 토큰과 쉼표도 보존합니다.
export function normalizeRegistrationKeywords(value,{editing=false}={}){const normalized=(Array.isArray(value)?value.join(','):String(value??'')).replace(/\s*[,，]\s*/g,',');if(editing)return normalized;const seen=new Set();return normalized.split(',').map(v=>v.trim()).filter(v=>{const key=v.normalize('NFKC').toLowerCase();if(!v||seen.has(key))return false;seen.add(key);return true;}).join(',');}
export function registrationIssues(record,catalog=null){
 const issues=[];const f=record.fields||{},s=record.structure||{};
 for(const [key,label] of [['dataName','데이터명'],['keywords','키워드'],['major','분류대'],['minor','분류중'],['basis','보유근거']])if(typeof f[key]!=='string'||!f[key].trim()||/확인\s*필요|미확인|추가 확인|검토 필요/.test(f[key]))issues.push(key==='basis'?'보유근거 입력 필요':`${label}: 등록값이 필요합니다.`);
 if(f.dataName&&(/[\\/:*?"<>|\u0000-\u001f]/.test(f.dataName)||`${f.dataName}.csv`!==s.fileName))issues.push('파일명 불일치: 데이터명 + .csv가 실제 CSV 파일명과 같아야 합니다.');
 if(!s.rowCount)issues.push('데이터 행이 없는 CSV는 최종 등록할 수 없습니다.');
 if(!(catalog?.verified||catalog?.official)||!Array.isArray(catalog.entries)||!catalog.entries.some(x=>x.major===f.major&&x.minor===f.minor))issues.push('분류체계DB 로딩 또는 분류 조합 검증 미완료입니다.');
 if(f.referenceDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(f.referenceDate)||Number.isNaN(Date.parse(f.referenceDate))||new Date(f.referenceDate).toISOString().slice(0,10)!==f.referenceDate))issues.push('데이터기준일을 올바른 YYYY-MM-DD로 입력하세요.');
 return issues;
}

// AI 제안과 담당자 입력은 분리합니다. 재제안 적용 시 직접 수정값은 기본적으로 보존합니다.
export function registrationCandidatePatch(candidate,catalog,current,dirty=[],overwrite=false){
 const patch={},skipped=[],edited=new Set(dirty);if(!candidate)return {patch,skipped};
 const set=(key,value)=>{if(typeof value!=='string'||!value.trim())return;if(!overwrite&&edited.has(key)){skipped.push(key);return;}patch[key]=key==='keywords'?normalizeRegistrationKeywords(value):value.trim();};
 for(const key of ['dataName','keywords'])set(key,candidate.fields?.[key]);
 const f=candidate.fields||{};
 if(catalog?.entries?.some(e=>e.major===f.major&&e.minor===f.minor)){
  // 수정 이력만 있고 값은 빈 선택이면 보호할 분류가 없습니다.
  const majorEdited=edited.has('major')&&!!current?.major?.trim(),minorEdited=edited.has('minor')&&!!current?.minor?.trim();
  if(!overwrite&&(minorEdited||(majorEdited&&current.major!==f.major)))skipped.push('major','minor');
  else{
   // 직접 고른 동일 대분류는 그대로 두고 비어 있는 중분류를 채울 수 있습니다.
   if(!overwrite&&majorEdited)skipped.push('major');else patch.major=f.major;
   patch.minor=f.minor;
  }
 }
 const b=candidate.basisRecommendation;if(b?.lawName&&b.verification?.state!=='not_found')set('basis',b.lawName);
 return {patch,skipped:[...new Set(skipped)]};
}

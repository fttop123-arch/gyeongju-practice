import { analyzeCsv } from './csv-analysis.mjs';
import { REGISTRATION_FIELDS, REGISTRATION_AI_FIELDS, registrationIssues, registrationInitialFields, normalizeRegistrationKeywords, registrationCandidatePatch } from './registration-schema.mjs';
const regEl=id=>document.getElementById('registration-'+id);
const regMode=document.getElementById('ai-mode'),regForm=document.getElementById('ai-form');
const regAuth=document.querySelector('.access-field'),regHome=regAuth.parentElement;
let regStructure=null,regCandidates=null,regCatalog=null,regCatalogTask=null;
let regRevision=0,regBusy=false,regAbort=null,regAuthEpoch=0,regWasAuthenticated=!document.getElementById('practice-logout').hidden;
const regDirty=new Set();
for(const [index,[key,title,hint]] of REGISTRATION_FIELDS.entries()){
 const label=document.createElement('label'),name=document.createElement('strong');
 const input=document.createElement(['major','minor'].includes(key)?'select':['basis','notes'].includes(key)?'textarea':'input');
 name.textContent=title;input.id='registration-field-'+key;input.maxLength=2000;input.rows=2;input.title=hint;
 if(key==='dataName')label.className='registration-name-field';label.append(name,input);(index<11?regEl('fields'):regEl('advanced-fields')).append(label);
 if(key==='keywords'){
  input.addEventListener('blur',()=>{input.value=normalizeRegistrationKeywords(input.value);});
  input.addEventListener('compositionend',()=>{input.value=normalizeRegistrationKeywords(input.value,{editing:true});});
 }
 input.addEventListener('input',event=>{
  if(key==='keywords'&&!event.isComposing){const position=input.selectionStart,prefix=normalizeRegistrationKeywords(input.value.slice(0,position),{editing:true});input.value=normalizeRegistrationKeywords(input.value,{editing:true});input.setSelectionRange(prefix.length,prefix.length);}
  regDirty.add(key);if(key==='major'){regPopulateMinor();regDirty.add('minor');}
  regEl('reviewed').checked=false;if(key==='basis')regEl('basis').checked=false;regRefreshReview();
 });
}
function regResetFields(){const defaults=registrationInitialFields();for(const [key] of REGISTRATION_FIELDS)regEl('field-'+key).value=defaults[key];regDirty.clear();}
function regRecord(){return {structure:regStructure,fields:Object.fromEntries(REGISTRATION_FIELDS.map(([key])=>[key,key==='keywords'?normalizeRegistrationKeywords(regEl('field-'+key).value):regEl('field-'+key).value.trim()])),reviewed:regEl('reviewed').checked,basisConfirmed:regEl('basis').checked};}
function regRefreshReview(){
 regEl('generate').disabled=regBusy||!regStructure;regEl('apply').disabled=regBusy||!regCandidates;regEl('review-download').disabled=regBusy||!regStructure;
 if(!regStructure){regEl('final-download').disabled=true;return;}
 const record=regRecord(),issues=registrationIssues(record,regCatalog);
 regEl('issues').replaceChildren(...issues.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 regEl('validation').hidden=!issues.length;regEl('validation-summary').textContent=`다운로드 전 확인 ${issues.length}개`;
 regEl('final-download').disabled=regBusy||issues.length>0;
 regEl('filename').textContent=record.fields.dataName+'.csv'===regStructure.fileName?'':`파일명 확인: 실제 ${regStructure.fileName} / RPA 예상 ${record.fields.dataName||'(데이터명 미입력)'}.csv`;
 regEl('filename').hidden=!regEl('filename').textContent;
}
function regSetBusy(value){
 regBusy=value;regMode.disabled=value;for(const id of ['file','encoding','catalog-reload'])regEl(id).disabled=value;
 for(const el of regEl('review').querySelectorAll('input,textarea,select'))el.disabled=value;
 for(const id of ['basis','reviewed'])regEl(id).disabled=value;regRefreshReview();
}
function regClear({keepFile=false}={}){
 regRevision++;regAbort?.abort();regAbort=null;regStructure=null;regCandidates=null;
 if(!keepFile)regEl('file').value='';for(const id of ['review','completion','candidates'])regEl(id).hidden=true;
 for(const id of ['consent','reviewed','basis','overwrite'])regEl(id).checked=false;
 regResetFields();regPopulateMinor();regEl('evidence').replaceChildren();
 for(const id of ['ai-status','download-status','classification-summary','basis-summary'])regEl(id).textContent='';
 regEl('status').textContent='CSV를 선택하면 구조를 자동 분석합니다.';regEl('payload').textContent='CSV 선택 후 전송할 구조정보를 확인할 수 있습니다.';
 regEl('validation').open=false;regSetBusy(false);
}
async function regAnalyze(){
 const file=regEl('file').files[0];if(!file)return;const revision=regRevision;regSetBusy(true);regEl('status').textContent='CSV 구조 분석 중…';
 try{
  if(file.size>5*1024*1024)throw Error('5MB 이하 CSV를 선택하세요.');
  const structure=analyzeCsv(await file.arrayBuffer(),file.name,regEl('encoding').value);if(revision!==regRevision)return;
  regStructure=structure;regEl('field-dataName').value=structure.fileName.replace(/\.csv$/i,'');
  regEl('status').textContent=`분석 완료 · ${structure.fileName} · ${structure.rowCount.toLocaleString()}행 · ${structure.columnCount}열`+(structure.warnings.length?' · '+structure.warnings.join(' '):'');
  const {warnings,...payload}=structure;regEl('payload').textContent=JSON.stringify(payload,null,2);
  regEl('review').hidden=false;regEl('completion').hidden=false;regLoadCatalog();
 }catch(error){if(revision===regRevision)regEl('status').textContent=error.message;}
 finally{if(revision===regRevision)regSetBusy(false);}
}
regEl('file').addEventListener('change',()=>{regClear({keepFile:true});regAnalyze();});
regEl('encoding').addEventListener('change',()=>{regClear({keepFile:true});regAnalyze();});
regEl('reset').addEventListener('click',()=>regClear());
function regRenderCandidates(data){
 const f=data.fields,b=data.basisRecommendation;
 regEl('classification-summary').textContent=f.major&&f.minor?`분류: ${f.major} / ${f.minor}`:'분류: '+data.classificationStatus;
 regEl('basis-summary').textContent=`보유근거: ${b?.lawName||'추천 없음'} (${b?.verification?.label||'법률명 미검증'})`;
 const lines=[];
 for(const key of REGISTRATION_AI_FIELDS){
  const label=REGISTRATION_FIELDS.find(([k])=>k===key)[1];
  if(key==='basis'){lines.push(`보유근거 추천 이유: ${b?.reason||'없음'}`,`법률명 확인: ${b?.verification?.label||'미검증'} / ${b?.verification?.reason||'추천 없음'}`);continue;}
  const sources=(data.evidence||[]).filter(e=>e.field===key).map(e=>e.source==='filename'?'파일명':`컬럼 ${e.columns.join(', ')}`).join(' / ');
  lines.push(`${label}: ${f[key]||'추천 없음'} · ${sources||'근거 없음'}`);
 }
 lines.push(data.classificationStatus,'법률명 확인은 업무 적합성·보유 권한의 확정이 아닙니다.');
 regEl('evidence').replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
 regEl('candidates').hidden=false;
}
regEl('generate').addEventListener('click',async()=>{
 if(!regStructure||regBusy)return;
 if(!regEl('consent').checked){regEl('ai-status').textContent='전송 범위 확인 및 외부 AI 전송 동의를 선택하세요.';return;}
 const revision=regRevision;if(!await window.practiceSession.ensure()||revision!==regRevision)return;
 regSetBusy(true);regAbort=new AbortController();regEl('ai-status').textContent='AI 등록정보 생성 중…';
 try{
  await regLoadCatalog();if(revision!==regRevision)return;
  const {warnings,...structure}=regStructure;
  const response=await fetch('/api/registration-metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structure,consent:true}),signal:AbortSignal.any([regAbort.signal,AbortSignal.timeout(55000)])});
  await window.practiceSession.handleResponse(response);const data=await response.json();if(revision!==regRevision)return;
  if(!response.ok)throw Error(data.error||'AI 등록정보 생성 실패');
  regCandidates=data;regRenderCandidates(data);regEl('ai-status').textContent='AI 추천 생성 완료 · 검토 후 AI 추천 적용을 누르세요. 기존 입력값은 유지됩니다.';
 }catch(error){if(revision===regRevision)regEl('ai-status').textContent=error.name==='TimeoutError'?'응답 시간 초과. 기존 입력값은 유지됩니다.':error.name==='AbortError'?'요청을 취소했습니다.':error.message;}
 finally{if(revision===regRevision)regSetBusy(false);}
});
regEl('apply').addEventListener('click',()=>{
 if(regBusy||!regCandidates)return;
 const current=regRecord().fields,{patch,skipped}=registrationCandidatePatch(regCandidates,regCatalog,current,regDirty,regEl('overwrite').checked);
 for(const [key,value] of Object.entries(patch)){
  if(key==='major'){regEl('field-major').value=value;regPopulateMinor();}else regEl('field-'+key).value=value;
  if(key==='basis'&&value!==current.basis)regEl('basis').checked=false;regDirty.delete(key);
 }
 regEl('reviewed').checked=false;regRefreshReview();
 regEl('download-status').textContent='AI 추천을 적용했습니다. 최종 검토 체크는 직접 선택하세요.'+(skipped.length?' 직접 수정한 항목은 유지했습니다.':'');
});
regEl('reviewed').addEventListener('change',regRefreshReview);
regEl('basis').addEventListener('change',()=>{regEl('reviewed').checked=false;regRefreshReview();});
for(const [id,kind] of [['review-download','review'],['final-download','final']])regEl(id).addEventListener('click',async()=>{
 if(!regStructure||regBusy)return;const revision=regRevision;
 if(kind==='final'&&registrationIssues(regRecord(),regCatalog).length){regEl('validation').open=true;return;}
 if(!await window.practiceSession.ensure()||revision!==regRevision)return;regSetBusy(true);regAbort=new AbortController();
 try{
  const r=await fetch('/api/registration-excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,records:[regRecord()]}),signal:AbortSignal.any([regAbort.signal,AbortSignal.timeout(20000)])});
  await window.practiceSession.handleResponse(r);if(!r.ok)throw Error((await r.json()).error||'Excel 생성 실패');
  const blob=await r.blob();if(revision!==regRevision)return;
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=kind==='review'?'등록자료_검토용.xlsx':'등록자료.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  regEl('download-status').textContent=kind==='review'?'검토용 다운로드 완료 · RPA 투입 금지':'등록자료.xlsx 다운로드 완료';
 }catch(error){if(revision===regRevision)regEl('download-status').textContent=error.message;}
 finally{if(revision===regRevision)regSetBusy(false);}
});
function regOptions(select,values,label){select.replaceChildren();for(const value of ['',...values]){const option=document.createElement('option');option.value=value;option.textContent=value||label;select.append(option);}}
function regPopulateMinor(){regOptions(regEl('field-minor'),(regCatalog?.entries||[]).filter(e=>e.major===regEl('field-major').value).map(e=>e.minor),'중분류 선택');}
function regPopulateMajor(){regOptions(regEl('field-major'),regCatalog?.majors||[],'대분류 선택');regPopulateMinor();}
async function regLoadCatalog(){
 if(regCatalogTask)return regCatalogTask;const epoch=regAuthEpoch;
 regCatalogTask=(async()=>{
  try{
   const r=await fetch('/api/registration-catalog',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error(r.status===401?'접속코드 인증 후 분류 목록을 불러옵니다.':(await r.json()).error);
   const c=await r.json();if(epoch!==regAuthEpoch)return;
   const changed=regCatalog?.version!==c.version,major=regEl('field-major').value,minor=regEl('field-minor').value;regCatalog=c;regPopulateMajor();
   // 대분류만 선택한 상태도 복원합니다. 중분류는 목록 갱신 후 유효한 값만 복원합니다.
   if(c.majors.includes(major)){regEl('field-major').value=major;regPopulateMinor();if(c.entries.some(e=>e.major===major&&e.minor===minor))regEl('field-minor').value=minor;}
   if(changed)regEl('reviewed').checked=false;
   regEl('catalog-status').textContent=`대분류 ${c.majorCount}개 · 중분류 ${c.minorCount}개 / ${c.source}`;
  }catch(error){if(epoch!==regAuthEpoch)return;regCatalog=null;regPopulateMajor();regEl('reviewed').checked=false;regEl('catalog-status').textContent=error.message+' 최종 다운로드 불가';}
  finally{regRefreshReview();}
 })();try{return await regCatalogTask;}finally{regCatalogTask=null;}
}
regEl('catalog-reload').addEventListener('click',async()=>{if(!regBusy&&await window.practiceSession.ensure())regLoadCatalog();});
function regSwitch(){
 const active=regMode.value==='registration';for(const e of regForm.querySelectorAll('.workspace-heading,.work-steps,.review-notice,.composer,.composer-note'))e.hidden=active;
 regEl('workspace').hidden=!active;document.getElementById('result-guide').hidden=active;document.querySelector('.skip-link').href=active?'#registration-file':'#ai-question';
 document.querySelector('.portal-nav a[href="#work-input"],.portal-nav a[href="#registration-title"]').href=active?'#registration-title':'#work-input';
 document.querySelector('.portal-nav a[href="#result-guide"],.portal-nav a[href="#registration-review"]').href=active?'#registration-review':'#result-guide';
 if(active){regEl('auth').append(regAuth);regLoadCatalog();}else regHome.insertBefore(regAuth,regHome.firstChild);
}
document.addEventListener('practice-auth-change',()=>{
 const authenticated=!document.getElementById('practice-logout').hidden;
 if(regWasAuthenticated&&!authenticated){regAuthEpoch++;regClear();regCatalog=null;regPopulateMajor();regEl('catalog-status').textContent='인증 후 분류 목록을 불러옵니다.';}
 regWasAuthenticated=authenticated;if(authenticated&&regMode.value==='registration')regLoadCatalog();
});
regResetFields();regPopulateMajor();regRefreshReview();regMode.addEventListener('change',regSwitch);regSwitch();

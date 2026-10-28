import {analyzeCsv} from './csv-analysis.mjs';
import {REGISTRATION_FIELDS,REGISTRATION_AI_FIELDS,normalizeRegistrationKeywords} from './registration-schema.mjs';
import {registrationFileIssue,registrationBatchItem,registrationAutoApply,registrationBatchRecord,registrationDownloadPlan,registrationItemLabel,createRegistrationQueue} from './registration-batch.mjs';
const regEl=id=>document.getElementById('registration-'+id),regMode=document.getElementById('ai-mode'),regForm=document.getElementById('ai-form');
const regAuth=document.querySelector('.access-field'),regHome=regAuth.parentElement;
let items=[],selected=null,catalog=null,catalogTask=null,epoch=0,busy=false,analyzing=false,abort=null,downloadBusy=false,wasAuthenticated=!document.getElementById('practice-logout').hidden;
const queue=createRegistrationQueue(),active=()=>items.find(i=>i.id===selected);
for(const [index,[key,title,hint]] of REGISTRATION_FIELDS.entries()){
 const label=document.createElement('label'),strong=document.createElement('strong'),input=document.createElement(['major','minor'].includes(key)?'select':['basis','notes'].includes(key)?'textarea':'input');
 strong.textContent=title;input.id='registration-field-'+key;input.maxLength=2000;input.rows=2;input.title=hint;
 if(key==='dataName')label.className='registration-name-field';label.append(strong,input);(index<11?regEl('fields'):regEl('advanced-fields')).append(label);
 input.addEventListener('input',event=>{
  const item=active();if(!item)return;
  if(key==='keywords'&&!event.isComposing){const position=input.selectionStart,prefix=normalizeRegistrationKeywords(input.value.slice(0,position),{editing:true});input.value=normalizeRegistrationKeywords(input.value,{editing:true});input.setSelectionRange(prefix.length,prefix.length);}
  item.fields[key]=input.value;if(!item.dirty.includes(key))item.dirty.push(key);
  if(key==='major'){item.fields.minor='';if(!item.dirty.includes('minor'))item.dirty.push('minor');populateMinor();}
  refresh();
 });
 if(key==='keywords')input.addEventListener('blur',()=>{const item=active();if(item){input.value=normalizeRegistrationKeywords(input.value);item.fields.keywords=input.value;refresh();}});
}
function options(select,values,label){select.replaceChildren();for(const value of ['',...values]){const o=document.createElement('option');o.value=value;o.textContent=value||label;select.append(o);}}
function populateMinor(){options(regEl('field-minor'),(catalog?.entries||[]).filter(e=>e.major===regEl('field-major').value).map(e=>e.minor),'중분류 선택');}
function showFields(item){
 options(regEl('field-major'),catalog?.majors||[],'대분류 선택');
 for(const [key] of REGISTRATION_FIELDS){if(key==='minor')continue;regEl('field-'+key).value=item.fields[key];}
 populateMinor();regEl('field-minor').value=item.fields.minor;
 regEl('encoding').value=item.encoding;
}
function renderCandidate(item){const data=item?.candidate;regEl('candidates').hidden=!data;if(!data)return;
 const f=data.fields,b=data.basisRecommendation;regEl('classification-summary').textContent=f.major&&f.minor?`AI 분류: ${f.major} / ${f.minor}`:'AI 분류: '+data.classificationStatus;
 regEl('basis-summary').textContent=`AI 관련 법률: ${b?.lawName||'추천 실패 — 직접 입력 필요'} (${b?.verification?.label||'법률명 미검증'})`+(b?.lawName?(data.basisRecommendationState==='failed'?' · 추천 실패 — 직접 입력 필요':' · 실제 보유근거는 담당자 확인'):'');
 const lines=REGISTRATION_AI_FIELDS.map(key=>{if(key==='basis')return `보유근거 이유: ${b?.reason||'없음'} · ${b?.verification?.label||'미검증'}`;const sources=(data.evidence||[]).filter(e=>e.field===key).map(e=>e.source==='filename'?'파일명':`컬럼 ${(e.columns||[]).join(', ')}`).join(' / ');return `${REGISTRATION_FIELDS.find(([k])=>k===key)[1]}: ${f[key]||'추천 없음'} · ${sources||'근거 없음'}`;});
 lines.push(data.classificationStatus,'AI 후보는 확정값이 아니며 담당자 수정값과 다를 수 있습니다.');regEl('evidence').replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
}
function renderList(){regEl('files').replaceChildren(...items.map(item=>{const li=document.createElement('li'),button=document.createElement('button'),remove=document.createElement('button');button.type=remove.type='button';button.className='registration-file-select';button.setAttribute('aria-pressed',String(item.id===selected));button.textContent=`${item.file.name} — ${registrationItemLabel(item,catalog)}`;button.addEventListener('click',()=>choose(item.id));remove.className='secondary';remove.textContent='제거';remove.setAttribute('aria-label',item.file.name+' 제거');remove.disabled=busy||analyzing||downloadBusy;remove.addEventListener('click',()=>{items=items.filter(i=>i!==item);if(selected===item.id)selected=items[0]?.id||null;render();});li.append(button,remove);return li;}));}
function refresh(){
 const item=active(),valid=items.filter(i=>i.structure),plan=registrationDownloadPlan(items,catalog);renderList();
 regEl('file').disabled=busy||analyzing||downloadBusy;regEl('generate').disabled=busy||analyzing||downloadBusy||!items.some(i=>i.structure&&!i.candidate&&!i.error);
 regEl('retry').disabled=busy||analyzing||downloadBusy||!item?.structure;regEl('catalog-reload').disabled=busy||analyzing||downloadBusy;regEl('encoding').disabled=busy||analyzing||downloadBusy||!item;
 regEl('prev').disabled=!item||items.indexOf(item)===0;regEl('next').disabled=!item||items.indexOf(item)===items.length-1;
 regEl('final-download').disabled=busy||analyzing||downloadBusy||!plan.included.length;regEl('review-download').disabled=busy||analyzing||downloadBusy||!valid.length;
 regEl('targets').textContent=`선택 ${items.length}건 · AI 생성 완료 ${items.filter(i=>i.candidate&&!i.error).length}건 · 정상 ${plan.included.length}건 · 확인 필요 ${plan.excluded.length}건 · Excel 다운로드 대상 ${plan.included.length}건`;
 regEl('issues').replaceChildren(...plan.excluded.map(e=>{const li=document.createElement('li');li.textContent=`제외 · ${e.fileName}: ${e.reasons.join(' / ')}`;return li;}));regEl('validation').hidden=!plan.excluded.length;regEl('validation-summary').textContent=`제외 파일·확인사항 ${plan.excluded.length}건`;
 if(item){regEl('current').textContent=`${items.indexOf(item)+1} / ${items.length} · ${item.file.name}`;
 regEl('filename').textContent=item.structure&&item.fields.dataName+'.csv'!==item.file.name?`파일명 불일치: 실제 ${item.file.name} / RPA 예상 ${item.fields.dataName||'(미입력)'}.csv`:'';
 regEl('status').textContent=item.error|| (item.structure?`분석 완료 · ${item.file.name} · ${item.structure.rowCount}행 · ${item.structure.columnCount}열`:'CSV 구조 분석 중…');
 for(const el of regEl('fields').querySelectorAll('input,select,textarea'))el.disabled=!item.structure;
 }else regEl('status').textContent='CSV를 선택하거나 끌어 놓으면 구조를 자동 분석합니다.';
}
function render(){const item=active();regEl('review').hidden=!item;regEl('completion').hidden=!items.length;regEl('candidates').hidden=!item?.candidate;
 if(item){showFields(item);renderCandidate(item);const {warnings,...payload}=item.structure||{};regEl('payload').textContent=item.structure?JSON.stringify(payload,null,2):'CSV 구조 분석 오류 · 인코딩을 확인하세요.';}
 else regEl('payload').textContent='선택한 파일의 전송 구조정보가 표시됩니다.';refresh();}
function choose(id){selected=id;render();}
async function analyzeItem(item){item.error='';item.structure=null;try{if(item.file.size>5*1024*1024)throw Error('5MB 이하 CSV만 지원합니다.');item.structure=analyzeCsv(await item.file.arrayBuffer(),item.file.name,item.encoding);if(!item.fields.dataName)item.fields.dataName=item.file.name.replace(/\.csv$/i,'');item.status=item.candidate?'ready':'waiting';}catch(e){item.error=e.message;item.status='error';}item.reviewed=false;}
async function addFiles(files){if(busy||analyzing||downloadBusy)return;analyzing=true;const runEpoch=epoch,errors=[];refresh();try{for(const file of files){const issue=registrationFileIssue(file,items);if(issue){errors.push(file.name+': '+issue);continue;}const item=registrationBatchItem(file,crypto.randomUUID());items.push(item);selected??=item.id;await analyzeItem(item);if(runEpoch!==epoch)return;}if(runEpoch===epoch)regEl('ai-status').textContent=errors.join('\n');}finally{if(runEpoch===epoch){analyzing=false;render();}}}
regEl('file').addEventListener('change',async event=>{const files=[...event.target.files];event.target.value='';await addFiles(files);});
const drop=regEl('drop');drop.addEventListener('dragover',event=>{event.preventDefault();if(!busy)drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');addFiles([...event.dataTransfer.files]);});
regEl('encoding').addEventListener('change',async()=>{const item=active();if(!item||busy||analyzing)return;item.encoding=regEl('encoding').value;item.candidate=null;analyzing=true;const runEpoch=epoch;refresh();await analyzeItem(item);if(runEpoch===epoch){analyzing=false;render();}});
function clear(){epoch++;abort?.abort();items=[];selected=null;busy=false;analyzing=false;downloadBusy=false;regEl('file').value='';regEl('ai-status').textContent='';regEl('download-status').textContent='';regEl('rpa-guide').hidden=true;regEl('rpa-toggle').setAttribute('aria-expanded','false');render();}
regEl('reset').addEventListener('click',clear);
regEl('prev').addEventListener('click',()=>{const n=items.indexOf(active());if(n>0)choose(items[n-1].id);});regEl('next').addEventListener('click',()=>{const n=items.indexOf(active());if(n<items.length-1)choose(items[n+1].id);});
async function generate(targets){if(busy||analyzing||downloadBusy||queue.running||!targets.length)return;const runEpoch=epoch;if(!await window.practiceSession.ensure()||runEpoch!==epoch)return;busy=true;abort=new AbortController();const signal=abort.signal;refresh();
 try{await loadCatalog();if(!catalog||runEpoch!==epoch)return;
 await queue.run(targets,async item=>{if(runEpoch!==epoch||!items.includes(item))return;item.status='generating';item.reviewed=false;regEl('ai-status').textContent=`AI 생성 ${items.indexOf(item)+1}/${items.length} · ${item.file.name}`;refresh();
  try{const {warnings,...structure}=item.structure;const response=await fetch('/api/registration-metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structure}),signal:AbortSignal.any([signal,AbortSignal.timeout(55000)])});await window.practiceSession.handleResponse(response);const data=await response.json();if(runEpoch!==epoch)return;if(!response.ok)throw Error(data.error||'AI 등록정보 생성 실패');registrationAutoApply(item,data,catalog);
  }catch(e){if(runEpoch!==epoch)return;item.error=e.name==='TimeoutError'?'AI 응답 시간 초과 · 이 파일을 다시 생성하세요.':e.name==='AbortError'?'요청 취소':e.message;item.status='error';item.reviewed=false;}
  if(runEpoch===epoch){if(selected===item.id)render();else refresh();}
 },{signal,onWaiting:(item,delay)=>{if(runEpoch===epoch)regEl('ai-status').textContent=`호출 제한 준수 · ${Math.ceil(delay/1000)}초 후 ${item.file.name} 처리`;}});
 if(runEpoch===epoch)regEl('ai-status').textContent='AI 처리 완료 · 정상 파일은 Excel에 자동 포함됩니다. 필요한 값만 수정하세요.';
 }catch(e){if(runEpoch===epoch)regEl('ai-status').textContent=e.name==='AbortError'?'처리를 취소했습니다.':e.message;}
 finally{if(runEpoch===epoch){busy=false;refresh();}}
}
regEl('generate').addEventListener('click',()=>generate(items.filter(i=>i.structure&&!i.candidate&&!i.error)));
regEl('retry').addEventListener('click',()=>generate(active()?.structure?[active()]:[]));
for(const [id,kind] of [['review-download','review'],['final-download','final']])regEl(id).addEventListener('click',async()=>{
 if(busy||analyzing||downloadBusy)return;const records=kind==='final'?registrationDownloadPlan(items,catalog).included:items.filter(i=>i.structure).map(registrationBatchRecord);if(!records.length)return;
 const runEpoch=epoch;if(!await window.practiceSession.ensure()||runEpoch!==epoch)return;downloadBusy=true;const controller=new AbortController();abort=controller;refresh();
 try{const response=await fetch('/api/registration-excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,records}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});await window.practiceSession.handleResponse(response);if(!response.ok)throw Error((await response.json()).error||'Excel 생성 실패');const blob=await response.blob();if(runEpoch!==epoch)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=kind==='final'?'등록자료.xlsx':'등록자료_검토용.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);regEl('download-status').textContent=`${link.download} 다운로드 완료 · ${records.length}건`;
 }catch(e){if(runEpoch===epoch)regEl('download-status').textContent=e.message;}finally{if(runEpoch===epoch){downloadBusy=false;refresh();}}
});
async function loadCatalog(){if(catalogTask)return catalogTask;const runEpoch=epoch;catalogTask=(async()=>{try{const response=await fetch('/api/registration-catalog',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('분류 목록을 불러오지 못했습니다. 로그인과 분류체계DB를 확인하세요.');const data=await response.json();if(runEpoch!==epoch)return;if(catalog?.version!==data.version)for(const item of items)item.reviewed=false;catalog=data;regEl('catalog-status').textContent=`대분류 ${data.majorCount}개 · 중분류 ${data.minorCount}개 / ${data.source}`;render();}catch(e){if(runEpoch===epoch){catalog=null;for(const item of items)item.reviewed=false;regEl('catalog-status').textContent=e.message+' 최종 다운로드 불가';refresh();}}})();try{return await catalogTask;}finally{catalogTask=null;}}
regEl('catalog-reload').addEventListener('click',()=>loadCatalog());
function switchMode(){const on=regMode.value==='registration';for(const el of regForm.querySelectorAll('.workspace-heading,.work-steps,.review-notice,.composer,.composer-note'))el.hidden=on;regEl('workspace').hidden=!on;document.getElementById('result-guide').hidden=on;document.querySelector('.skip-link').href=on?'#registration-file':'#ai-question';document.querySelector('.portal-nav a[href="#work-input"],.portal-nav a[href="#registration-title"]').href=on?'#registration-title':'#work-input';document.querySelector('.portal-nav a[href="#result-guide"],.portal-nav a[href="#registration-review"]').href=on?'#registration-review':'#result-guide';if(on){regEl('auth').append(regAuth);if(!catalog)loadCatalog();}else regHome.insertBefore(regAuth,regHome.firstChild);}
document.addEventListener('practice-auth-change',()=>{const authenticated=!document.getElementById('practice-logout').hidden;if(wasAuthenticated&&!authenticated){clear();catalog=null;}wasAuthenticated=authenticated;if(authenticated&&regMode.value==='registration'&&!catalog)loadCatalog();});
render();regMode.addEventListener('change',switchMode);switchMode();

regEl('rpa-toggle').addEventListener('click',()=>{const open=regEl('rpa-guide').hidden;regEl('rpa-guide').hidden=!open;regEl('rpa-toggle').setAttribute('aria-expanded',String(open));});

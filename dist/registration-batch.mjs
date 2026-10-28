import {registrationInitialFields,registrationIssues,registrationCandidatePatch} from './registration-schema.mjs';
export const REGISTRATION_MAX_FILES=10;
export function registrationFileIssue(file,items){
 if(!/\.csv$/i.test(file.name))return 'CSV 파일만 추가할 수 있습니다.';
 if(items.some(i=>i.file.name.normalize('NFKC').toLowerCase()===file.name.normalize('NFKC').toLowerCase()))return '동일 파일명은 중복 추가할 수 없습니다.';
 if(items.length>=REGISTRATION_MAX_FILES)return 'CSV는 최대 10개까지 선택할 수 있습니다.';
 return '';
}
export function registrationBatchItem(file,id){return {id,file,encoding:'auto',structure:null,candidate:null,fields:registrationInitialFields(),dirty:[],reviewed:false,basisConfirmed:false,status:'waiting',error:''};}
export function registrationAutoApply(item,candidate,catalog){
 const {patch,skipped}=registrationCandidatePatch(candidate,catalog,item.fields,item.dirty);
 if(patch.basis!==undefined&&patch.basis!==item.fields.basis)item.basisConfirmed=false;
 Object.assign(item.fields,patch);item.candidate=candidate;item.reviewed=false;item.error='';item.status='ready';return skipped;
}
export function registrationBatchRecord(item){return {structure:item.structure,fields:{...item.fields},reviewed:item.reviewed,basisConfirmed:item.basisConfirmed};}
export function registrationDownloadPlan(items,catalog){
 const included=[],excluded=[];
 for(const item of items){const reasons=!item.structure?[item.error||'CSV 구조 분석 미완료']:item.error?[item.error]:item.status==='generating'?['AI 생성 중']:!item.candidate?['AI 등록정보 생성 미완료']:registrationIssues(registrationBatchRecord(item),catalog);
  if(reasons.length)excluded.push({id:item.id,fileName:item.file.name,reasons});else included.push(registrationBatchRecord(item));}
 return {included,excluded};
}
export function registrationItemLabel(item,catalog){if(item.status==='generating')return 'AI 생성 중';if(item.error)return '오류';if(!item.candidate)return 'AI 생성 대기';return registrationIssues(registrationBatchRecord(item),catalog).length?'확인 필요':'정상';}
// 대기·재생성 요청까지 한 큐에서 처리합니다. 기존 서버 5회/분 제한 이내로 간격을 둡니다.
export function createRegistrationQueue({interval=13000,now=()=>Date.now(),wait=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const cancel=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});})}={}){
 let running=false,nextAt=0;
 return {get running(){return running;},async run(items,process,{signal,onWaiting=()=>{}}={}){if(running)throw Error('AI 처리 중입니다.');running=true;try{for(const item of items){signal?.throwIfAborted();const delay=Math.max(0,nextAt-now());if(delay){onWaiting(item,delay);await wait(delay,signal);}signal?.throwIfAborted();nextAt=now()+interval;await process(item);}}finally{running=false;}}};
}

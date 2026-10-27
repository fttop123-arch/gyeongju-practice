// 현행 대한민국 법률명 존재 확인만 수행합니다. 업무 적합성·보유 권한은 판단하지 않습니다.
// 공식 명세: https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdListGuide
const lawXmlText=s=>s.replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&(amp|lt|gt|quot|apos);/g,(_,v)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v]));
const lawXmlValue=(xml,key)=>lawXmlText(xml.match(new RegExp('<'+key+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+key+'>'))?.[1]||'').trim();
export async function verifyRegistrationLawName(lawName,{oc='',fetchApi=fetch,signal,now=new Date()}={}){
 const unverified=reason=>({state:'unverified',label:'법률명 미검증',reason});
 if(!oc)return unverified('API 인증값 미설정');
 if(typeof lawName!=='string'||!lawName.trim())return unverified('추천 법률명 없음');
 try{
  const url=new URL('https://www.law.go.kr/DRF/lawSearch.do');
  for(const [k,v] of Object.entries({OC:oc,target:'eflaw',type:'XML',search:'1',query:lawName,display:'100',page:'1',nw:'3'}))url.searchParams.set(k,v);
  const timeout=AbortSignal.timeout(6000),requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchApi(url,{signal:requestSignal,redirect:'error',headers:{Accept:'application/xml'}});
  if(!response.ok)return unverified('법령 조회 서비스 응답 오류');
  const reader=response.body?.getReader();if(!reader)return unverified('법령 조회 응답 없음');
  let size=0;const parts=[];while(true){const {value,done}=await reader.read();if(done)break;if((size+=value.length)>524288){await reader.cancel();return unverified('법령 조회 응답 크기 초과');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/(<\/?)[A-Za-z_][\w.-]*:/g,'$1');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<LawSearch\b/.test(xml)||/<(?:error|errorCode|errorMessage|resultCode|message)\b/i.test(xml))return unverified('법령 조회 응답 형식 오류');
  const countText=lawXmlValue(xml,'totalCnt');if(!/^\d+$/.test(countText))return unverified('법령 조회 검색건수 미확인');
  const count=Number(countText),rows=[...xml.matchAll(/<law\b[^>]*>([\s\S]*?)<\/law>/g)].map(m=>m[1]);
  if(count>100||rows.length!==count)return unverified('법령 조회 결과가 완전하지 않음');
  const exact=rows.filter(row=>lawXmlValue(row,'법령명한글')===lawName);
  const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
  let uncertain=false;
  for(const row of exact){
   const kind=lawXmlValue(row,'법령구분명'),date=lawXmlValue(row,'시행일자'),history=lawXmlValue(row,'현행연혁코드'),change=lawXmlValue(row,'제개정구분명');
   if(!kind){uncertain=true;continue;}if(kind!=='법률')continue;
   if(!/^\d{8}$/.test(date)||Number.isNaN(Date.parse(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6)))||!history||!change){uncertain=true;continue;}
   if(new Date(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6)).toISOString().slice(0,10).replace(/-/g,'')!==date){uncertain=true;continue;}
   if(date>today||/연혁|예정|폐지/.test(history)||/폐지/.test(change))continue;
   return {state:'verified',label:'법률명 존재 여부: 확인 완료',reason:'현행법령 목록의 정확한 법률명·법령 종류 확인',lawName,verifiedAt:now.toISOString()};
  }
  if(uncertain)return unverified('법령 종류·현행 여부 응답 정보 부족');
  return {state:'not_found',label:'현행 법률명으로 확인되지 않음',reason:'현행법령 목록에 정확히 일치하는 법률 없음'};
 }catch{return unverified('법령 조회 실패 또는 시간 초과');}
}

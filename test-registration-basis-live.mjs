// --live 때만 합성 구조를 전송합니다. 인증정보·AI 원문·프롬프트 출력/저장 없음.
import {analyzeCsv} from './dist/csv-analysis.mjs';import {loadRegistrationCatalog} from './registration-catalog.mjs';import {getLlmConfiguration} from './llm-providers.mjs';import {generateRegistrationMetadata} from './registration-metadata.mjs';import {registrationBatchItem,registrationAutoApply,registrationBatchRecord} from './dist/registration-batch.mjs';import {createRegistrationExcel} from './registration-excel.mjs';
if(process.argv.includes('--live')){
 const catalog=await loadRegistrationCatalog(),config=getLlmConfiguration(process.env);if(config?.name!=='hasa'||!config.apiKey)throw Error('HASA 설정을 확인하세요.');
 const cases=[['관광안내소 현황','안내소명,소재지,운영시간'],['공영주차장 현황','주차장명,주차면수,주차요금'],['도시공원 시설 현황','공원명,공원유형,편의시설,운동시설'],['도서관 현황','도서관명,자료실명,장서수,운영시간'],['공공자전거 대여소 현황','대여소명,설치위치,거치대수,대여가능시간']];
 for(const [name,header] of cases){const fileName='합성 '+name+'.csv',structure=analyzeCsv(new TextEncoder().encode(header+'\n'+header.split(',').map(()=>'가상자료').join(',')),fileName);let calls=0;const rawCandidateStates=[];
 try{const result=await generateRegistrationMetadata({structure,catalog,config,recommendBasis:true,lawOc:process.env.LAW_API_OC||'',fetchApi:async(u,o)=>{const isAi=String(u).endsWith('/chat/completions');if(isAi)calls++;const r=await fetch(u,o);if(isAi&&r.ok){try{const b=await r.clone().json(),v=JSON.parse(b.choices[0].message.content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));rawCandidateStates.push(!v.basisRecommendation?'missing':!v.basisRecommendation.lawName?'empty':'present');}catch{rawCandidateStates.push('unparseable');}}return r;}});
 const item=registrationBatchItem({name:fileName},'synthetic');item.structure=structure;registrationAutoApply(item,result,catalog);const autoBasis=item.fields.basis;item.fields.basis=autoBasis||'합성 시험 담당자 직접 확인 근거';item.basisConfirmed=true;item.reviewed=true;
 // 분류 추천 부적절 여부와 별개로 J열 계약을 검증하기 위해 담당자가 실제 목록 조합을 선택한 상황입니다.
 if(!item.fields.major||!item.fields.minor){const selected=catalog.entries.find(e=>e.major==='문화체육관광'&&e.minor==='관광');item.fields.major=selected.major;item.fields.minor=selected.minor;}
 const xml=new TextDecoder().decode(createRegistrationExcel([registrationBatchRecord(item)],{catalog})),j=xml.match(/<c r="J2"[^>]*><is><t[^>]*>(.*?)<\/t>/)?.[1];console.log(JSON.stringify({case:name,calls,rawCandidateStates,lawName:result.basisRecommendation?.lawName||'',state:result.basisRecommendationState,verification:result.basisRecommendation?.verification.state,autoApplied:autoBasis,excelJMatches:j===item.fields.basis}));
 }catch(e){console.log(JSON.stringify({case:name,calls,rawCandidateStates,errorCode:e.code||'FAILED'}));process.exitCode=1;}
 }
}

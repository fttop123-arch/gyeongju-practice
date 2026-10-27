// 명시적 --live 때만 호출. 합성 구조만 전송, 원문·키·프롬프트 저장/출력 없음.
import {loadRegistrationCatalog} from './registration-catalog.mjs';
import {analyzeCsv} from './dist/csv-analysis.mjs';
import {getLlmConfiguration} from './llm-providers.mjs';
import {generateRegistrationMetadata} from './registration-metadata.mjs';
if(process.argv.includes('--live')){
 const catalog=await loadRegistrationCatalog(),config=getLlmConfiguration(process.env);
 if(config?.name!=='hasa'||!config.apiKey||process.env.HUB_CONNECTION_VERIFIED!=='true')throw Error('확인된 HASA 서버 설정이 필요합니다.');
 const cases=[
  ['공영주차장','가상시 공영주차장 운영 현황.csv','주차장명,도로명주소,주차구획수,운영요일,주차요금정보','가상주차장,가상로,30,매일,무료'],
  ['생활폐기물','가상시 생활폐기물 수거함 현황.csv','수거함명,설치장소,폐기물종류,수거요일','가상수거함,가상장소,생활폐기물,월요일'],
  ['도서관','가상시 도서관 자료실 운영 현황.csv','도서관명,자료실명,장서수,열람좌석수,운영시간','가상도서관,가상자료실,100,20,09시'],
  ['직접 일치 없음','가상시 공공우산 대여 서비스 현황.csv','대여지점명,대여가능수량,반납가능여부,운영시간','가상지점,10,true,09시']
 ];
 for(const [name,fileName,header,row] of cases){if(process.argv.some(a=>a.startsWith('--case='))&&!process.argv.includes('--case='+name))continue;let calls=0,shape=null,nameMatches=null;const structure=analyzeCsv(new TextEncoder().encode(header+'\n'+row),fileName);
  try{const r=await generateRegistrationMetadata({structure,config,catalog,recommendBasis:process.argv.includes('--basis'),lawOc:process.env.LAW_API_OC||'',fetchApi:async(u,o)=>{calls++;const response=await fetch(u,o);if(response.ok){try{const b=await response.clone().json();const v=JSON.parse(b.choices[0].message.content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));nameMatches=v.dataName===fileName.replace(/\.csv$/i,'');shape=(v.evidence||[]).map(e=>({field:['dataName','keywords','description','major','minor','tableDescription','basis'].includes(e.field)?e.field:'unknown',source:e.source===undefined?'absent':['filename','description','columns'].includes(e.source)?e.source:'unknown',hasIds:Object.hasOwn(e,'columnIds'),idCount:Array.isArray(e.columnIds)?e.columnIds.length:null,hasNames:Object.hasOwn(e,'columns'),otherKeys:Object.keys(e).filter(k=>!['field','source','columnIds','columns'].includes(k)).length}));}catch{shape=null;}}return response;}});console.log(JSON.stringify({case:name,calls,model:config.model,state:r.classificationState,retried:r.classificationRetried,major:r.fields.major,minor:r.fields.minor,pairValid:catalog.entries.some(e=>e.major===r.fields.major&&e.minor===r.fields.minor),sources:r.evidence.filter(e=>['major','minor'].includes(e.field)).map(e=>({field:e.field,source:e.source||'columns',columns:e.columns})),basisEmpty:!r.fields.basis,...(process.argv.includes('--basis')?{basisRecommendation:r.basisRecommendation}:{})}));}
  catch(e){console.log(JSON.stringify({case:name,calls,code:e.code||'UNEXPECTED',providerStatus:e.providerStatus||null,finishReason:e.finishReason||null,dataNameMatchesFile:nameMatches,evidenceShape:shape}));process.exitCode=1;}
 }
}

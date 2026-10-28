import { REGISTRATION_AI_ERRORS, registrationAiDiagnostic } from './registration-errors.mjs';
import { practiceAuth } from './practice-auth.mjs';
import { getLlmConfiguration } from './llm-providers.mjs';
import { generateRegistrationMetadata, validateRegistrationStructure } from './registration-metadata.mjs';
import { createRegistrationExcel } from './registration-excel.mjs';
export function createRegistrationHandler(fetchApi=fetch,loadCatalog=async()=>null){
 const usage=new Map();
 return async function registrationResponse(request,env){
  const fail=(error,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  if(new URL(request.url).pathname==='/api/registration-catalog'&&request.method==='GET'){
   if(!await practiceAuth.authorized(request,env))return fail('비밀번호 인증이 필요합니다.',401);
   try{const catalog=await loadCatalog();if(!catalog?.verified)throw Error();return Response.json(catalog,{headers:{'Cache-Control':'no-store'}});}catch{return fail('분류체계DB를 읽지 못했습니다. 관리자에게 파일과 분류 목록 확인을 요청하세요. 최종 다운로드는 차단됩니다.',503);}
  }
  if(request.method!=='POST')return fail('POST 요청만 허용됩니다.',405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('현재 홈페이지에서 요청하세요.',403);
  if(!await practiceAuth.authorized(request,env))return fail('비밀번호 인증이 필요합니다.',401);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return fail('JSON 요청이 필요합니다.',415);
  let data;try{
   const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();return fail('등록 요청이 너무 큽니다.',413);}parts.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}data=JSON.parse(new TextDecoder().decode(bytes));
  }catch{return fail('요청 형식을 확인하세요.');}
  // 어떤 API에서도 비밀값을 결과/Excel에 반사하지 않습니다. 실제 값은 로그에 남기지 않습니다.
  const serialized=JSON.stringify(data);if(!serialized)return fail('등록 요청이 필요합니다.');
  const secrets=Object.entries(env).filter(([k,v])=>/KEY|TOKEN|SECRET|PASSWORD|ACCESS_CODE|_OC$/i.test(k)&&typeof v==='string'&&v).map(([,v])=>v);
  if(secrets.some(s=>serialized.includes(s)))return fail('전송 정보에 서버 비밀값이 포함되어 있습니다.');
  try{
   if(new URL(request.url).pathname==='/api/registration-excel'){
    if(!['review','final'].includes(data.kind))throw Error('출력 종류를 확인하세요.');
    // 요청 본문의 catalog/검증 플래그는 신뢰하지 않습니다.
    const reviewOnly=data.kind==='review';let catalog=null;try{catalog=await loadCatalog();}catch{}
    const bytes=createRegistrationExcel(data.records,{reviewOnly,catalog});
    const name=reviewOnly?'등록자료_검토용.xlsx':'등록자료.xlsx';
    return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':"attachment; filename=registration.xlsx; filename*=UTF-8''"+encodeURIComponent(name),'Cache-Control':'no-store'}});
   }
   if(new URL(request.url).pathname!=='/api/registration-metadata')return fail('지원하지 않는 등록 API입니다.',404);
   const structure=validateRegistrationStructure(data.structure);
   const config=getLlmConfiguration(env);
   if(!config?.apiKey||!config.model||(config.name==='hasa'&&env.HUB_CONNECTION_VERIFIED!=='true'))return fail('서버 AI 연결 설정을 확인하세요.',503);
   const now=Date.now(),client=request.headers.get('CF-Connecting-IP')||'local';for(const [k,v] of usage)if(v.until<=now)usage.delete(k);
   const used=usage.get(client)||{count:0,until:now+60000};if(used.count>=5||usage.size>10000)return fail('AI 후보 요청은 1분에 최대 5회입니다.',429);used.count++;usage.set(client,used);
   let catalog=null;try{catalog=await loadCatalog();}catch{}
   if(!catalog?.verified)return fail('분류체계DB를 읽지 못했습니다. AI 분류 추천과 최종 다운로드를 사용할 수 없습니다. 직접 검토와 검토용 Excel은 사용할 수 있습니다.',503);
   let result;try{result=await generateRegistrationMetadata({structure,config,fetchApi,catalog,recommendBasis:true,lawOc:env.LAW_API_OC||''});}catch(error){
    const diagnostic=registrationAiDiagnostic(error,crypto.randomUUID());
    console.warn(JSON.stringify(diagnostic));
    const [status,message]=REGISTRATION_AI_ERRORS[diagnostic.code];
    return Response.json({error:message+'\n확인 번호: '+diagnostic.requestId,code:diagnostic.code,requestId:diagnostic.requestId},{status,headers:{'Cache-Control':'no-store'}});
   }
   if(secrets.some(s=>JSON.stringify(result).includes(s)))return fail('AI 응답에 비밀정보가 포함되어 표시하지 않습니다.',502);
   return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return fail(error.message||'등록 항목을 확인하세요.');}
 };
}

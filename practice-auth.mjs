// HttpOnly 쿠키에는 무작위 세션 ID만 저장합니다. 세션은 서버 메모리에만 존재합니다.
export function createPracticeAuth({now=()=>Date.now()}={}) {
  const sessions=new Map(), failures=new Map();
  const ttl=8*60*60*1000, cookieName='practice_session';
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const equal=async(a,b)=>{const x=await digest(a),y=await digest(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;};
  const cookie=request=>request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const clean=()=>{for(const [k,v] of sessions)if(v.expiresAt<=now())sessions.delete(k);for(const [k,v] of failures)if(v.until<=now())failures.delete(k);};
  const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
  const cookieHeader=(request,value,maxAge)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  async function session(request,env){clean();const token=cookie(request);if(!/^[a-f0-9]{64}$/.test(token)||!env.PRACTICE_ACCESS_CODE)return null;const key=await digest(token),s=sessions.get(key);if(!s)return null;if(s.codeHash!==await digest(env.PRACTICE_ACCESS_CODE)){sessions.delete(key);return null;}return s;}
  return {
    async authorized(request,env,legacyCode){return !!(await session(request,env))||!!(env.PRACTICE_ACCESS_CODE&&typeof legacyCode==='string'&&await equal(legacyCode,env.PRACTICE_ACCESS_CODE));},
    async handle(request,env){
      const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
      if(request.method==='GET'){const s=await session(request,env);return json({authenticated:!!s,expiresAt:s?.expiresAt||null});}
      if(!sameOrigin(request))return json({error:'이 홈페이지에서 인증해 주세요.'},403);
      if(request.method==='DELETE')return this.logout(request,env);
      if(request.method!=='POST')return json({error:'지원하지 않는 인증 요청입니다.'},405);
      if(!env.PRACTICE_ACCESS_CODE)return json({error:'서버 접속코드 설정을 확인해 주세요.'},503);
      clean();const client=request.headers.get('CF-Connecting-IP')||'local';const failed=failures.get(client);if(failed?.count>=5)return json({error:'인증 시도가 많습니다. 1분 후 다시 시도해 주세요.'},429);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'인증 요청 형식을 확인해 주세요.'},415);
      let body;try{const reader=request.body?.getReader();if(!reader)throw Error();const parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json({error:'인증 요청이 너무 큽니다.'},413);}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'인증 요청 형식을 확인해 주세요.'},400);}
      if(typeof body?.accessCode!=='string'||!await equal(body.accessCode,env.PRACTICE_ACCESS_CODE)){if(failures.size>=10000&&!failures.has(client))return json({error:'잠시 후 다시 인증해 주세요.'},429);failures.set(client,{count:(failed?.count||0)+1,until:failed?.until||now()+60000});return json({error:'실습 접속코드를 확인해 주세요.'},401);}
      if(sessions.size>=10000)return json({error:'접속자가 많습니다. 잠시 후 다시 시도해 주세요.'},503);
      const old=cookie(request);if(old)sessions.delete(await digest(old));const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');const expiresAt=now()+ttl;sessions.set(await digest(token),{expiresAt,codeHash:await digest(env.PRACTICE_ACCESS_CODE)});failures.delete(client);
      return json({authenticated:true,expiresAt},200,{'Set-Cookie':cookieHeader(request,token,ttl/1000)});
    },
    async logout(request,env){if(!sameOrigin(request))return Response.json({error:'이 홈페이지에서 로그아웃해 주세요.'},{status:403,headers:{'Cache-Control':'no-store'}});const token=cookie(request);if(token)sessions.delete(await digest(token));return Response.json({authenticated:false},{headers:{'Cache-Control':'no-store','Set-Cookie':cookieHeader(request,'',0)}});}
  };
}
export const practiceAuth=createPracticeAuth();

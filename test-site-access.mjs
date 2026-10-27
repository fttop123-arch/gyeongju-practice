import test from 'node:test';import assert from 'node:assert/strict';
import {siteAccessResponse} from './site-access.mjs';import {practiceAuth} from './practice-auth.mjs';
const origin='https://synthetic.example',env={PRACTICE_ACCESS_CODE:'synthetic-access-only'};
test('전체 사이트: 로그인 화면만 공개, 모든 업무 자산/API 보호, 본문 코드로 우회 불가',async()=>{
 const page=await siteAccessResponse(new Request(origin+'/'),env);assert.equal(page.status,200);assert.match(await page.text(),/site-login-form/);assert.equal(page.headers.get('Cache-Control'),'no-store');
 for(const path of ['/style.css','/registration-ui.mjs','/api/status','/api/ask','/api/registration-catalog','/api/registration-metadata','/api/sample-excel','/api/application-upload'])assert.equal((await siteAccessResponse(new Request(origin+path),env)).status,401);
 assert.equal((await siteAccessResponse(new Request(origin+'/api/ask',{method:'POST',body:JSON.stringify({accessCode:env.PRACTICE_ACCESS_CODE})}),env)).status,401);
 assert.equal(await siteAccessResponse(new Request(origin+'/api/auth'),env),null);
 const script=await siteAccessResponse(new Request(origin+'/site-login.js'),env);assert.equal(script.status,200);assert.doesNotMatch(await script.text(),/localStorage|sessionStorage|synthetic-access-only/);
});
test('암호 오류·정상 로그인·쿠키 속성·업무 진입·로그아웃 후 전면 차단',async()=>{
 const login=code=>practiceAuth.handle(new Request(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accessCode:code})}),env);
 assert.equal((await login('wrong-synthetic')).status,401);const result=await login(env.PRACTICE_ACCESS_CODE);assert.equal(result.status,200);const header=result.headers.get('Set-Cookie');for(const attr of ['HttpOnly','Secure','SameSite=Strict','Max-Age=28800'])assert(header.includes(attr));const cookie=header.split(';')[0];
 for(const path of ['/','/registration-ui.mjs','/api/ask','/api/registration-catalog'])assert.equal(await siteAccessResponse(new Request(origin+path,{headers:{Cookie:cookie}}),env),null);
 assert.equal((await practiceAuth.handle(new Request(origin+'/api/auth',{method:'DELETE',headers:{Origin:origin,Cookie:cookie}}),env)).status,200);
 assert.equal((await siteAccessResponse(new Request(origin+'/api/ask',{headers:{Cookie:cookie}}),env)).status,401);
 assert.match(await (await siteAccessResponse(new Request(origin+'/',{headers:{Cookie:cookie}}),env)).text(),/site-login-form/);
});

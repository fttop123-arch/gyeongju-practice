// 실제 로컬 화면/API 테스트. 인증값은 환경변수에서만 읽고 출력하지 않습니다.
import {chromium} from 'file:///C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
process.loadEnvFile(new URL('./.env',import.meta.url));
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const results = []; let asks = 0;
page.on('request',r=>{if(r.url().endsWith('/api/ask')) asks++;});
const questions = [
  '경주시 문화재 현황을 주소와 관리부서까지 받고 싶습니다.',
  '비공개 정보가 포함된 데이터도 제공할 수 있나요?',
  '공공데이터 제공신청을 하면 언제까지 결정해야 하나요?',
  '신청인이 요청하면 기관에서 데이터를 새로 가공해서 제공해야 하나요?',
];
try {
  await page.goto('http://127.0.0.1:8000');
  await page.waitForFunction(()=>!document.querySelector('#ai-form button').disabled);
  await page.locator('#ai-access-code').fill(process.env.PRACTICE_ACCESS_CODE);
  for (const [mode,question] of [...questions.map(q=>['public-data',q]),['chat','3 더하기 5는 얼마인가요?'],['rag','세션1 평가항목을 알려주세요.']]) {
    await page.locator('#ai-mode').selectOption(mode); await page.locator('#ai-question').fill(question);
    const pending = page.waitForResponse(r=>r.url().endsWith('/api/ask'),{timeout:155000}); const started = Date.now();
    await page.locator('#ai-form button').click(); const response = await pending; const data = await response.json();
    await page.waitForFunction(()=>!document.querySelector('#ai-form button').disabled,{timeout:110000});
    const screen = await page.locator('body').innerText();
    for (const [key,value] of Object.entries(process.env)) if (/KEY|TOKEN|SECRET|ACCESS_CODE/i.test(key) && value && (screen.includes(value) || JSON.stringify(data).includes(value))) throw new Error('비밀정보 표시 검사 실패');
    const result = {mode,question,http:response.status(),seconds:Math.round((Date.now()-started)/100)/10};
    if (mode === 'public-data' && response.ok()) {
      Object.assign(result,{cards:await page.locator('.public-data-card').count(),summary:data.analysis.summary,lawStatus:data.lawStatus,hits:data.lawEvidence,checks:data.analysis.checks,cautions:data.analysis.cautions});
      if (result.cards !== 7 || data.lawEvidence.length !== 4) throw new Error('카드/법령 근거 표시 실패');
      await page.locator('.public-data-law-evidence details').first().locator('summary').click();
      result.evidenceOnScreen = await page.locator('.public-data-law-evidence').innerText().then(t=>t.includes('코사인') && t.includes('기관의 검토'));
      if(question === questions[0]) {
        const before = asks, downloadWait = page.waitForEvent('download');
        await page.getByRole('button',{name:'샘플 Excel 생성'}).click(); const download = await downloadWait;
        await download.saveAs('C:/Users/Owner/Desktop/AI실습/gyeongju-debug-package/법령RAG_문화재_샘플.xlsx');
        result.excelDownloaded = !await download.failure(); result.excelExtraAIRequests = asks - before;
        await writeFile('C:/Users/Owner/Desktop/AI실습/gyeongju-debug-package/law-excel-headers.json',JSON.stringify(data.analysis.columns.map(c=>c.name)));
        await page.setViewportSize({width:390,height:900}); result.mobileOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth); await page.setViewportSize({width:1440,height:1000});
      }
    } else if(response.ok()) Object.assign(result,{answer:data.answer,sources:data.sources,debugVisible:await page.locator('#rag-debug').evaluate(e=>!e.hidden)});
    else {let message=String(data.error);for(const [k,v] of Object.entries(process.env))if(/KEY|TOKEN|SECRET|ACCESS_CODE/i.test(k)&&v)message=message.split(v).join('[숨김]');result.error=message;}
    results.push(result);
    console.log(JSON.stringify({...result,hits:result.hits?.map(h=>({rank:h.rank,document:h.document,article:h.article,pages:h.pages,score:h.score,cosine:h.cosineScore,quotes:h.quotes}))}));
    await writeFile('C:/Users/Owner/Desktop/AI실습/gyeongju-debug-package/law-test-results.json',JSON.stringify(results,null,2));
    await new Promise(r=>setTimeout(r,20000));
  }
} finally {await browser.close();}

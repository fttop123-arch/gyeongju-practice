// 공공데이터법 검색 전용. 대회 안내서의 인덱스/검색 동작은 바꾸지 않습니다.
import { embedTexts } from './embedding-provider.mjs';
import { cosine } from './rag.mjs';
import { analyzePublicDataApplication } from './public-data-helper.mjs';
export async function searchPublicDataLaws({question, env, index, fetchApi = fetch}) {
  if (!index?.chunks?.length || !index.embeddingModel) throw new Error('법령 RAG 준비가 필요합니다. 텍스트 추출과 prepare-public-data-rag.mjs를 먼저 실행해 주세요.');
  const [vector] = await embedTexts([question], env, index.embeddingModel, fetchApi);
  // 일상 표현과 법령 용어의 차이를 보완합니다. 조문 번호를 강제로 지정하지 않습니다.
  const terms = [];
  if (/비공개|공개하지|개인정보|제3자|저작권|권리/.test(question)) terms.push('비공개대상정보','제3자','분리','이용허락');
  if (/언제|기한|기간|결정|며칠|연장/.test(question)) terms.push('제공 여부','10일','연장','신청');
  if (/새로|가공|생성|변형|요약|발췌/.test(question)) terms.push('생성','변형','가공','요약','발췌','의무');
  const generalApplication = !terms.length;
  if (generalApplication) terms.push('보유','관리','제공대상','제공신청','목록');
  const ranked = index.chunks.map(chunk => {
    const semantic = cosine(vector,chunk.vector);
    const clean = chunk.text.replace(/\s/g,'');
    const keyword = terms.filter(term => clean.includes(term.replace(/\s/g,''))).length / terms.length;
    // 일반 신청에는 제공대상 범위를 먼저 검토하도록 해당 제목에 작은 보조 점수를 줍니다.
    const scopeBonus = generalApplication && /제공대상.*범위/.test(chunk.article) ? 0.15 : 0;
    return {...chunk,semantic,keyword,scopeBonus,score:semantic + 0.35 * keyword + scopeBonus};
  }).sort((a,b)=>b.score-a.score);
  // 4개의 서로 다른 조문을 사용하여 같은 조문만 반복되는 것을 피합니다.
  const seen = new Set(), hits = [];
  for (const chunk of ranked) {
    const key = chunk.document + ':' + chunk.article;
    if (seen.has(key)) continue;
    seen.add(key); hits.push(chunk); if(hits.length === 4) break;
  }
  return hits;
}
export async function analyzeWithPublicDataLaws({question, env, config, index, fetchApi = fetch}) {
  const hits = await searchPublicDataLaws({question,env,index,fetchApi});
  const context = hits.map((hit,i)=>`[근거 ${i+1}] ${hit.documentName}, ${hit.article}, PDF ${hit.pages.join(', ')}페이지\n${hit.text}`).join('\n\n');
  const result = await analyzePublicDataApplication({question,config,fetchApi,lawContext:context,lawHits:hits});
  // 기간의 기산점을 흔히 쓰는 '신청일'로 바꾸는 것을 막고 핵심 조건은 원문으로 확인합니다.
  const terms = /언제|기한|기간|결정|연장/.test(question) ? ['요청을받은날부터','결정기간을연장']
    : /비공개|개인정보|제3자|저작권/.test(question) ? ['비공개대상정보','기술적으로분리']
    : /새로|가공|생성|변형|요약|발췌/.test(question) ? ['의무를지지아니한다'] : [];
  const passages = [];
  for (const [i,hit] of hits.entries()) {
    for (const paragraph of hit.text.split(/(?=[①-⑳])/).slice(1)) {
      if (terms.some(term=>paragraph.replace(/\s/g,'').includes(term))) passages.push({id:i+1,text:paragraph.trim()});
    }
  }
  if (passages.some(p=>p.text.replace(/\s/g,'').includes('요청을받은날부터10일이내'))) {
    const correct = text => text.replace(/신청일(?:로)?부터\s*10일/g,'요청을 받은 날부터 10일');
    result.analysis.summary = correct(result.analysis.summary);
    for (const key of ['checks','cautions']) result.analysis[key] = result.analysis[key].map(correct);
    result.analysis.departmentDraft = correct(result.analysis.departmentDraft);
  }
  result.analysis.cautions.unshift(...passages.slice(0,3).map(passage=>`[근거 ${passage.id}] PDF 원문 확인: ${passage.text}`));
  for (const passage of passages.slice(0,3)) {
    if (!result.evidence.some(e=>e.id===passage.id)) result.evidence.push({id:passage.id,quote:hits[passage.id-1].text.slice(0,650)});
  }
  return {analysis:result.analysis,lawStatus:result.evidence.length ? '검색된 PDF 조문을 참고한 검토용 분석입니다.' : '법령 문서에서 직접 확인되지 않음',lawEvidence:hits.map((hit,i)=>({rank:i+1,document:hit.document,documentName:hit.documentName,article:hit.article,pages:hit.pages,chunkId:hit.id,cosineScore:Number(hit.semantic.toFixed(6)),keywordScore:Number(hit.keyword.toFixed(6)),scopeBonus:hit.scopeBonus,score:Number(hit.score.toFixed(6)),preview:hit.text.slice(0,650)+(hit.text.length>650?'…':''),quotes:result.evidence.filter(e=>e.id===i+1).map(e=>e.quote)}))};
}

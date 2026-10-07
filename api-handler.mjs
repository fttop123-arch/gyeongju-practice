// 이 파일은 서버에서만 실행됩니다. API 키를 HTML에 넣지 않습니다.
import { getLlmConfiguration } from './llm-providers.mjs';
import { answerWithRag } from './rag.mjs';
import { analyzeWithPublicDataLaws } from './public-data-law-rag.mjs';
import { applicationMetadata } from './application-metadata.mjs';
export function apiStatus(env) {
  const config = getLlmConfiguration(env);
  return Response.json({ ready: Boolean(config?.apiKey && config?.model && env.PRACTICE_ACCESS_CODE && (config.name !== 'hasa' || env.HUB_CONNECTION_VERIFIED === 'true')), provider: config?.name || 'unconfigured' }, { headers: { 'Cache-Control': 'no-store' } });
}
export function createApiHandler(fetchApi = fetch, ragIndex = null, lawIndex = null) {
  const usage = new Map(); // 서버 인스턴스별 보조 제한이며 전체 비용 한도는 아닙니다.
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return async function ask(request, env) {
    if (request.method !== 'POST') return json({ error: 'POST 요청만 가능합니다.' }, 405);
    if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: '이 홈페이지에서 질문해 주세요.' }, 403);
    const config = getLlmConfiguration(env);
    if (!config?.apiKey || !config?.model || !env.PRACTICE_ACCESS_CODE || (config.name === 'hasa' && env.HUB_CONNECTION_VERIFIED !== 'true')) return json({ error: '서버 API 연결 테스트와 설정이 아직 완료되지 않았습니다.' }, 503);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: '잘못된 요청 형식입니다.' }, 415);
    if (Number(request.headers.get('Content-Length')) > 16000) return json({ error: '질문이 너무 깁니다.' }, 413);
    let data;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: '질문을 입력해 주세요.' }, 400);
      const chunks = []; let length = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 16000) { await reader.cancel(); return json({ error: '질문이 너무 깁니다.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return json({ error: '질문 형식을 확인해 주세요.' }, 400); }
    if (!data || typeof data !== 'object' || data.accessCode !== env.PRACTICE_ACCESS_CODE) return json({ error: '실습 접속코드를 확인해 주세요.' }, 401);
    const question = typeof data.question === 'string' ? data.question.trim() : '';
    if (!question || question.length > 2000) return json({ error: '질문을 1~2,000자로 입력해 주세요.' }, 400);
    let application = null;
    if (data.mode === 'public-data') {
      try { application = applicationMetadata(data.application,env); }
      catch { return json({error:'신청 건 정보의 길이와 내용을 확인해 주세요.'},400); }
    }
    const now = Date.now();
    for (const [key, value] of usage) if (value.reset <= now) usage.delete(key);
    const client = request.headers.get('CF-Connecting-IP') || 'local';
    const count = usage.get(client) || { count: 0, reset: now + 60000 };
    if (count.count >= 5) return json({ error: '질문이 많습니다. 1분 뒤 다시 시도해 주세요.' }, 429);
    count.count++; usage.set(client, count);
    try {
      if (data.mode === 'public-data') {
        return json({...await analyzeWithPublicDataLaws({question,env,config,index:lawIndex,fetchApi}),...(application ? {application} : {})});
      }
      if (data.mode === 'rag') {
        if (!ragIndex) return json({ error: 'PDF 검색 준비가 아직 완료되지 않았습니다.' }, 503);
        return json(await answerWithRag({ question, env, config, index: ragIndex, fetchApi }));
      }
      const answer = await config.provider.generate({
        question,
        instructions: '당신은 경주시 홈페이지 실습용 AI 업무도우미입니다. 공개자료와 가상자료를 이용한 안내문 초안, 문장 정리, 일반적인 업무 계획을 한국어로 간결하게 도와주세요. 공식 경주시 담당자라고 주장하지 마세요. 최신 정책, 일정, 법령, 민원 절차를 사실처럼 단정하지 말고 공식 자료 확인이 필요함을 설명하세요. 사용자의 입력을 검증된 사실로 취급하지 마세요. 개인정보나 비공개 행정자료 입력을 요청하지 마세요.',
        model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl, fetchApi,
      });
      if (!answer) return json({ error: '답변을 생성하지 못했습니다. 질문을 조금 짧게 바꿔 주세요.' }, 502);
      return json({ answer });
    } catch (error) {
      if (config.name === 'hasa') {
        const message = String(error.message).split(config.apiKey).join('[API 키 숨김]').replace(/sk-[\w-]+/g, '[API 키 숨김]').slice(0, 1500);
        console.error('[Service Hub 연결 오류]', message);
        const hint = error.status === 401 ? '개발용 API 키가 올바른지 확인하세요.' : error.status === 403 ? '계정 또는 모델 접근 권한을 확인하세요.' : error.status === 404 ? '모델 ID 또는 API 경로를 확인하세요.' : error.status === 429 ? '개발계정 요청 한도에 도달했습니다.' : error.name === 'TimeoutError' ? 'API 응답 시간이 초과되었습니다.' : 'Service Hub 응답 또는 네트워크 상태를 확인하세요.';
        return json({ error: `${hint}\n${message}` }, error.status === 429 ? 429 : 502);
      }
      if (error.status === 429) return json({ error: '무료 API 할당량 또는 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 Google AI Studio에서 사용량을 확인해 주세요. 유료 API로 자동 전환하지 않습니다.' }, 429);
      if (error.status || error.message === 'MODEL_CONFIG') return json({ error: 'AI 연결에 실패했습니다. 관리자에게 API 키와 모델 설정 확인을 요청해 주세요.' }, 502);
      return json({ error: '응답 시간이 초과되었거나 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.' }, 504);
    }
  };
}

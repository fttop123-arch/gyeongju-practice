// 공급자별 통신만 이 파일에 둡니다. 화면은 항상 /api/ask를 사용합니다.
export const llmProviders = {
  hasa: {
    keyName: 'HASA_API_KEY', defaultModel: '',
    async generate({ question, instructions, model, apiKey, fetchApi, baseUrl = 'https://open.hasa.re.kr/v1', maxTokens = 700 }) {
      if (!model || baseUrl.replace(/\/$/, '') !== 'https://open.hasa.re.kr/v1') throw new Error('MODEL_CONFIG');
      const response = await fetchApi(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: question }], max_tokens: maxTokens, stream: false }),
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) {
        const raw = await response.text();
        const detail = raw.split(apiKey).join('[API 키 숨김]').replace(/sk-[\w-]+/g, '[API 키 숨김]').replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [숨김]').slice(0, 1500);
        const error = new Error(`Service Hub HTTP ${response.status}: ${detail || response.statusText}`);
        error.status = response.status; error.provider = 'hasa'; throw error;
      }
      const body = await response.json();
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('Service Hub 응답에 choices[0].message.content가 없습니다. 응답 형식 또는 모델 상태를 확인해야 합니다.');
      return text.trim();
    },
  },
  gemini: {
    keyName: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash',
    async generate({ question, instructions, model, apiKey, fetchApi }) {
      if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error('MODEL_CONFIG');
      const response = await fetchApi(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 700, ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
        }), signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) { const error = new Error('UPSTREAM'); error.status = response.status; throw error; }
      const body = await response.json();
      if (body.promptFeedback?.blockReason) return '이 질문에는 답변을 제공할 수 없습니다. 공개자료나 가상자료를 이용한 다른 질문을 입력해 주세요.';
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') return '이 질문에는 답변을 제공할 수 없습니다. 질문을 바꿔 주세요.';
      return (candidate?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('\n').trim();
    },
  },
};
export function getLlmConfiguration(env) {
  const name = env.LLM_PROVIDER || 'gemini'; const provider = llmProviders[name];
  if (!provider) return null; // 유료 API로 자동 대체하지 않습니다.
  return { provider, name, model: env.LLM_MODEL || provider.defaultModel, apiKey: env[provider.keyName], baseUrl: env.HASA_BASE_URL || 'https://open.hasa.re.kr/v1' };
}

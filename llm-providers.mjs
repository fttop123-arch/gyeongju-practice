// 공급자별 통신만 이 파일에 둡니다. 화면은 항상 /api/ask를 사용합니다.
export const llmProviders = {
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
  return { provider, name, model: env.LLM_MODEL || provider.defaultModel, apiKey: env[provider.keyName] };
}

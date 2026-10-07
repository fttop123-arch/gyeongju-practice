// 문서와 질문 모두 같은 서버용 임베딩 API를 사용합니다.
export async function embedTexts(texts, env, model, fetchApi = fetch) {
  const key = env.HASA_API_KEY;
  const base = (env.HASA_BASE_URL || '').replace(/\/$/, '');
  if (!key || base !== 'https://open.hasa.re.kr/v1' || !model) throw new Error('임베딩 서버 설정을 확인해 주세요.');
  const response = await fetchApi(base + '/embeddings', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts, encoding_format: 'float' }), signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const detail = (await response.text()).split(key).join('[API 키 숨김]').replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [숨김]').slice(0, 1000);
    const error = new Error(`임베딩 API HTTP ${response.status}: ${detail}`); error.status = response.status; throw error;
  }
  const body = await response.json();
  const rows = body.data?.slice().sort((a, b) => a.index - b.index);
  if (!rows || rows.length !== texts.length || rows.some(row => !Array.isArray(row.embedding) || !row.embedding.length || row.embedding.some(n => !Number.isFinite(n)))) throw new Error('임베딩 응답에 정상 벡터가 없습니다.');
  return rows.map(row => row.embedding);
}

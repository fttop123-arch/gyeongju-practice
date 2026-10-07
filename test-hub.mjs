// 실제 키는 .env에서 읽기만 하며 화면에 표시하지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { llmProviders } from './llm-providers.mjs';
try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch {}
const key = process.env.HASA_API_KEY;
const base = (process.env.HASA_BASE_URL || 'https://open.hasa.re.kr/v1').replace(/\/$/, '');
const redact = text => String(text).split(key || 'NO_KEY').join('[API 키 숨김]').replace(/sk-[\w-]+/g, '[API 키 숨김]');
try {
  if (!key) throw new Error('.env의 HASA_API_KEY= 뒤에 개발용 API 키를 넣고 저장해 주세요.');
  if (base !== 'https://open.hasa.re.kr/v1') throw new Error('Base URL은 https://open.hasa.re.kr/v1로 설정해 주세요.');
  const response = await fetch(base + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`모델 목록 조회 HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const models = Array.isArray(body.data) ? body.data : [];
  const ids = models.map(item => item.id).filter(id => typeof id === 'string');
  console.log('서버에서 조회한 실제 모델 ID:', JSON.stringify(ids));
  // 실제 목록에 있는 한국어/일반 채팅 모델만 후보로 삼습니다.
  const candidates = ids.filter(id => /exaone|qwen|llama|gpt-oss|deepseek/i.test(id) && !/embed|bge|rerank|ocr|whisper|audio|speech|tts|image|video|vision|\bvl\b|coder|coding/i.test(id));
  const requested = process.env.LLM_MODEL;
  const model = requested && ids.includes(requested) && candidates.includes(requested) ? requested : candidates.find(id => /exaone/i.test(id)) || candidates.find(id => /qwen/i.test(id)) || candidates[0];
  if (!model) throw new Error('모델 목록에서 일반 채팅 후보를 확인하지 못했습니다. 포털 모델 카탈로그와 개발키 접근 권한을 확인해야 합니다. 모델명을 추측하지 않습니다.');
  console.log('선택한 실제 채팅 모델 ID:', model);
  const question = '안녕하세요. 한국어로 짧게 한 문장만 인사해 주세요.';
  const answer = await llmProviders.hasa.generate({ question, instructions: '간결한 한국어 대화 도우미입니다.', model, apiKey: key, baseUrl: base, fetchApi: fetch });
  console.log('테스트 질문:', question); console.log('실제 API 답변:', redact(answer));
  const filename = new URL('./.env', import.meta.url);
  let contents = await readFile(filename, 'utf8');
  const updates = { LLM_PROVIDER: 'hasa', HASA_BASE_URL: base, LLM_MODEL: model, HUB_CONNECTION_VERIFIED: 'true' };
  if (!process.env.PRACTICE_ACCESS_CODE) updates.PRACTICE_ACCESS_CODE = randomBytes(16).toString('hex');
  for (const [name, value] of Object.entries(updates)) {
    const pattern = new RegExp('^' + name + '=.*$', 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, name + '=' + value) : contents.trimEnd() + '\n' + name + '=' + value + '\n';
  }
  await writeFile(filename, contents);
  console.log('정상 응답 확인 후 .env의 모델 ID와 테스트 완료 상태를 저장했습니다. 키와 접속코드는 출력하지 않았습니다.');
} catch (error) {
  console.error('연결 테스트 실패:', redact(error.message));
  if (error.cause) console.error('네트워크 원인:', redact(error.cause.message || error.cause.code));
  process.exitCode = 1;
}

// 실제 API 테스트. 키/접속코드는 출력하거나 결과 파일에 저장하지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import { createApiHandler } from './api-handler.mjs';
process.loadEnvFile(new URL('./.env', import.meta.url));
const index = JSON.parse(await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8'));
const pacedFetch = async (...args) => { await new Promise(resolve => setTimeout(resolve, 7000)); return fetch(...args); };
const ask = createApiHandler(pacedFetch, index);
const questions = ['이 대회의 본선은 언제 열리나요?', '세션1 평가항목을 알려주세요.', 'GitLab에 무엇을 제출해야 하나요?', '개발할 때 특정 LLM만 사용해야 하나요?', '이 문서에 경주시 인구가 몇 명이라고 나와 있나요?'];
const results = [];
for (const question of process.argv[2] ? [questions[Number(process.argv[2]) - 1]] : questions) {
  const start = Date.now();
  const request = new Request('http://127.0.0.1:8000/api/ask', { method: 'POST', headers: { Origin: 'http://127.0.0.1:8000', 'Content-Type': 'application/json' }, body: JSON.stringify({ question, accessCode: process.env.PRACTICE_ACCESS_CODE, mode: 'rag' }) });
  const response = await ask(request, process.env);
  const body = await response.json();
  const result = { question, status: response.status, seconds: Number(((Date.now() - start) / 1000).toFixed(2)), ...body };
  let safe = JSON.stringify(result);
  for (const name of ['HASA_API_KEY', 'PRACTICE_ACCESS_CODE']) if (process.env[name]) safe = safe.split(process.env[name]).join('[비밀값 숨김]');
  const sanitized = JSON.parse(safe); results.push(sanitized); console.log(safe);
  if (!response.ok) break; // 오류가 발생하면 원인을 확인한 뒤 진행합니다.
}
await writeFile(new URL('./rag-test-results.json', import.meta.url), JSON.stringify(results, null, 2));

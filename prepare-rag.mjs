// 사전 준비: 실제 모델 목록 확인 → chunk 생성 → 임베딩 → JSON 저장.
import { readFile, writeFile } from 'node:fs/promises';
import { embedTexts } from './embedding-provider.mjs';
process.loadEnvFile(new URL('./.env', import.meta.url));
try {
  const response = await fetch(process.env.HASA_BASE_URL + '/models', { headers: { Authorization: `Bearer ${process.env.HASA_API_KEY}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`모델 목록 HTTP ${response.status}`);
  const ids = (await response.json()).data.map(row => row.id);
  const requested = process.argv[2] || 'qwen3-embedding-4b';
  const model = ids.find(id => id === requested && /embed/i.test(id));
  if (!model) throw new Error('실제 모델 목록에서 지정한 임베딩 모델을 확인하지 못했습니다. 진행을 중단합니다.');
  const pdf = JSON.parse(await readFile(new URL('./data/pdf-text.json', import.meta.url), 'utf8'));
  const chunks = [];
  let section = '';
  // 페이지 경계를 넘지 않고 최대 900자, 긴 페이지는 150자 중복.
  for (const page of pdf.pages) {
    const raw = page.text.replace(/\s+/g, ' ').trim();
    const heading = raw.match(/세션([12])\s+AI\s+(정부 실험실 챔피언십|미션 경진대회)/);
    if (heading) section = heading[0];
    if (/4\.\s*제출 절차/.test(raw)) section = '공통 안내';
    const text = (section ? `[문서 구역: ${section}]\n` : '') + raw;
    for (let start = 0; start < text.length; start += 750) {
      chunks.push({ id: `p${page.page}-${start}`, page: page.page, text: text.slice(start, start + 900) });
      if (start + 900 >= text.length) break;
    }
  }
  const vectors = [];
  for (let start = 0; start < chunks.length; start++) {
    await new Promise(resolve => setTimeout(resolve, 7000)); // 개발키 10 RPM 한도 준수
    vectors.push(...await embedTexts([chunks[start].text], process.env, model));
    console.log(`문서 조각 임베딩: ${start + 1}/${chunks.length}`);
  }
  const index = { document: pdf.document, embeddingModel: model, chunkSize: 900, overlap: 150, chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })) };
  await writeFile(new URL('./data/rag-index.json', import.meta.url), JSON.stringify(index));
  console.log(JSON.stringify({ success: true, model, pages: pdf.pages.length, chunks: chunks.length, dimensions: vectors[0].length }));
} catch (error) {
  let message = String(error.message);
  for (const name of ['HASA_API_KEY', 'PRACTICE_ACCESS_CODE']) if (process.env[name]) message = message.split(process.env[name]).join('[비밀값 숨김]');
  console.error(message); process.exitCode = 1;
}

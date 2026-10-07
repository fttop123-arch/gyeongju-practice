// 기존 RAG의 임베딩 모델을 재사용합니다. .env는 읽기만 합니다.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { embedTexts } from './embedding-provider.mjs';
process.loadEnvFile(new URL('./.env', import.meta.url));
try {
  const previous = JSON.parse(await readFile(new URL('./data/rag-index.json', import.meta.url), 'utf8'));
  const source = JSON.parse(await readFile(new URL('./data/public-data-laws-text.json', import.meta.url), 'utf8'));
  const chunks = [];
  // 다른 조문끼리는 섞지 않습니다. 최대 약 1,400자, 긴 조문은 줄 단위 150자 중복.
  for (const doc of source.documents) for (const article of doc.articles) {
    let lines = [], size = 0, part = 0;
    const add = () => {
      if (!lines.length) return;
      const pages = [...new Set(lines.map(line => line.page))];
      chunks.push({id:`${doc.document}:${article.article}:part${++part}`, document:doc.document, documentName:doc.documentName, article:article.article, pages, text:`${article.article}\n${lines.map(line => line.text).join(' ')}`});
    };
    for (const line of article.lines) {
      if (size + line.text.length > 1400 && lines.length) {
        add(); const tail = []; let overlap = 0;
        for (let i = lines.length - 1; i >= 0 && overlap < 150; i--) {tail.unshift(lines[i]); overlap += lines[i].text.length;}
        lines = tail; size = overlap;
      }
      lines.push(line); size += line.text.length;
    }
    add();
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(chunks)).digest('hex');
  const checkpointPath = new URL('./data/public-data-law-index.pending.json', import.meta.url);
  let cached = {embeddingModel:previous.embeddingModel, fingerprint, vectors:[]};
  try {const saved = JSON.parse(await readFile(checkpointPath,'utf8')); if (saved.embeddingModel === previous.embeddingModel && saved.fingerprint === fingerprint) cached = saved;} catch (e) {if(e.code !== 'ENOENT') throw e;}
  for (let start = cached.vectors.length; start < chunks.length; start += 8) {
    if (start) await new Promise(resolve => setTimeout(resolve, 7000));
    const batch = chunks.slice(start, start + 8);
    cached.vectors.push(...await embedTexts(batch.map(c => c.text), process.env, previous.embeddingModel));
    await writeFile(checkpointPath, JSON.stringify(cached));
    console.log(`법령 임베딩 ${cached.vectors.length}/${chunks.length}`);
  }
  if (cached.vectors.some(v => v.length !== previous.chunks[0].vector.length)) throw new Error('기존 임베딩 차원과 다릅니다.');
  const index = {embeddingModel:previous.embeddingModel, chunkSize:1400, overlap:150, scope:'두 PDF의 본문 조문(부칙·별표 제외)', documents:source.documents.map(d=>({document:d.document,name:d.documentName,pages:d.pages.length})), chunks:chunks.map((chunk,i)=>({...chunk,vector:cached.vectors[i]}))};
  await writeFile(new URL('./data/public-data-law-index.json.tmp',import.meta.url),JSON.stringify(index));
  await rename(new URL('./data/public-data-law-index.json.tmp',import.meta.url),new URL('./data/public-data-law-index.json',import.meta.url));
  await unlink(checkpointPath);
  console.log(JSON.stringify({model:index.embeddingModel,chunks:chunks.length,dimensions:cached.vectors[0].length}));
} catch (error) {
  let message = String(error.message);
  for (const [name,value] of Object.entries(process.env)) if (/KEY|TOKEN|SECRET|ACCESS_CODE/i.test(name) && value) message = message.split(value).join('[숨김]');
  console.error(message); process.exitCode = 1;
}

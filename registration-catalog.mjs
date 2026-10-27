// 서버 전용: 패키지 설치·수식 실행·외부 통신 없이 확인된 전사본만 읽습니다.
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const catalogPath=new URL('./data/기관공유데이터_분류체계DB_사회복지추가.xlsx',import.meta.url);
const xmlText=s=>s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(lt|gt|amp|quot|apos);/g,(_,n)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[n]));
const attribute=(s,k)=>s.match(new RegExp('\\b'+k+'=["\']([^"\']*)["\']'))?.[1]||'';
export function parseRegistrationCatalog(bytes){
 const b=Buffer.from(bytes);if(b.length>2097152||b.length<22)throw Error('분류체계DB 파일 크기를 확인하세요.');
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}
 if(end<0||b.readUInt16LE(end+4)||b.readUInt16LE(end+6))throw Error('분류체계DB 압축 형식 오류');
 let offset=b.readUInt32LE(end+16),total=0;const files=new Map(),count=b.readUInt16LE(end+10);if(count>128)throw Error('분류체계DB 구성 오류');
 for(let i=0;i<count;i++){
  if(offset+46>end||b.readUInt32LE(offset)!==0x02014b50)throw Error('분류체계DB 압축 오류');
  const method=b.readUInt16LE(offset+10),size=b.readUInt32LE(offset+24),packed=b.readUInt32LE(offset+20),n=b.readUInt16LE(offset+28),extra=b.readUInt16LE(offset+30),comment=b.readUInt16LE(offset+32),local=b.readUInt32LE(offset+42),name=b.subarray(offset+46,offset+46+n).toString('utf8');
  if(b.readUInt16LE(offset+8)&1||![0,8].includes(method)||size>2097152||(total+=size)>8388608||files.has(name)||name.includes('..')||local+30>b.length||b.readUInt32LE(local)!==0x04034b50)throw Error('분류체계DB 구성 오류');
  const start=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);if(start+packed>b.length)throw Error('분류체계DB 누락');
  const raw=b.subarray(start,start+packed),data=method===8?inflateRawSync(raw,{maxOutputLength:2097152}):raw;if(data.length!==size)throw Error('분류체계DB 크기 오류');
  const xml=data.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('분류체계DB XML 오류');files.set(name,xml.replace(/(<\/?)[A-Za-z_][\w.-]*:/g,'$1'));offset+=46+n+extra+comment;
 }
 const workbook=files.get('xl/workbook.xml')||'',sheet=[...workbook.matchAll(/<sheet\b[^>]*>/g)].find(x=>xmlText(attribute(x[0],'name'))==='분류체계DB');
 const rels=files.get('xl/_rels/workbook.xml.rels')||'',link=[...rels.matchAll(/<Relationship\b[^>]*>/g)].find(x=>attribute(x[0],'Id')===attribute(sheet?.[0]||'','r:id'));
 const target=attribute(link?.[0]||'','Target'),path=target.startsWith('/')?target.slice(1):'xl/'+target,xml=files.get(path);if(!sheet||!xml||attribute(link[0],'TargetMode')==='External')throw Error('분류체계DB 시트를 찾지 못했습니다.');
 const text=x=>[...x.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1])).join('');
 const strings=[...(files.get('xl/sharedStrings.xml')||'').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(x=>text(x[1]));
 const rows=[...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(r=>{const row={};for(const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){if(/<f\b/.test(c[2]||''))throw Error('분류체계DB에 수식은 허용되지 않습니다.');const raw=(c[2]||'').match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]||'';row[attribute(c[1],'r').replace(/\d/g,'')]=(attribute(c[1],'t')==='s'?strings[+raw]:attribute(c[1],'t')==='inlineStr'?text(c[2]||''):xmlText(raw))?.trim()||'';}return row;});
 const header=rows.shift();if(!header||header.A!=='번호'||header.B!=='대분류'||header.C!=='중분류'||header.D!=='확인상태'||header.E!=='출처')throw Error('분류체계DB 열 구조가 변경되었습니다.');
 const entries=[],seen=new Set();for(const row of rows){if(!Object.values(row).some(Boolean))continue;const major=row.B,minor=row.C;if(!major||!minor)throw Error('분류체계DB에 빈 분류가 있습니다.');const key=JSON.stringify([major,minor]);if(seen.has(key))throw Error('분류체계DB에 중복 조합이 있습니다.');seen.add(key);entries.push({major,minor});}
 const majors=[...new Set(entries.map(e=>e.major))];if(majors.length!==17||entries.length!==77)throw Error('분류체계DB 예상 건수(17/77)와 다릅니다. 변경 여부를 확인하세요.');
 return {verified:true,version:createHash('sha256').update(b).digest('hex'),source:'담당자 확인 등록 화면 전사본 · 공식 코드값 및 향후 변경 미확인',majorCount:majors.length,minorCount:entries.length,majors,entries};
}
export async function loadRegistrationCatalog(path=catalogPath){return parseRegistrationCatalog(await readFile(path));}

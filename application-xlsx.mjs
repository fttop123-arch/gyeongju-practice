// 서버용 .xlsx 신청서 읽기. 저장/AI 호출/수식 실행/외부 링크 요청을 하지 않습니다.
const formFields = {receiptNumber:['접수번호'],receiptDate:['접수일','접수일자'],dataName:['공공데이터명칭','공공데이터명'],content:['공공데이터내용'],purpose:['공공데이터활용목적','활용목적']};
const formNames = {receiptNumber:'접수번호',receiptDate:'접수일',dataName:'공공데이터 명칭',content:'공공데이터 내용',purpose:'공공데이터 활용 목적'};
const formDecode = new TextDecoder('utf-8',{fatal:true});
const formAttr = (tag,name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`))?.[1] || '';
const formText = text => text.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(lt|gt|amp|quot|apos);/g,(_,n)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[n])).replace(/_x([\da-f]{4})_/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
function formCrc(bytes) {let crc=0xffffffff; for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
async function formArchive(bytes) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end = -1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0 || view.getUint16(end+4,true) || view.getUint16(end+6,true)) throw new Error('손상되었거나 지원하지 않는 Excel 파일입니다. .xlsx로 다시 저장해 주세요.');
  const count=view.getUint16(end+10,true), entries=new Map(); let offset=view.getUint32(end+16,true), total=0;
  if(count>512 || count===0) throw new Error('신청서 크기나 구성 항목이 너무 많습니다. 단순한 신청서 .xlsx로 저장해 주세요.');
  for(let i=0;i<count;i++){
    if(offset+46>end || view.getUint32(offset,true)!==0x02014b50) throw new Error('Excel 압축 구조가 손상되었습니다. 다시 저장해 주세요.');
    const flags=view.getUint16(offset+8,true), method=view.getUint16(offset+10,true), crc=view.getUint32(offset+16,true), compressed=view.getUint32(offset+20,true), size=view.getUint32(offset+24,true), nameLength=view.getUint16(offset+28,true), extra=view.getUint16(offset+30,true), comment=view.getUint16(offset+32,true), local=view.getUint32(offset+42,true);
    if(offset+46+nameLength+extra+comment>end || (flags&1) || ![0,8].includes(method) || size>2*1024*1024 || (total+=size)>10*1024*1024) throw new Error('암호화되었거나 압축 해제 크기가 너무 큰 파일은 읽을 수 없습니다.');
    const name=formDecode.decode(bytes.subarray(offset+46,offset+46+nameLength));
    if(entries.has(name) || name.includes('..') || name.includes('\\')) throw new Error('지원하지 않는 Excel 파일 구성입니다.');
    entries.set(name,{local,compressed,size,method,crc}); offset+=46+nameLength+extra+comment;
  }
  return async path => {
    const entry=entries.get(path); if(!entry)return null;
    const {local,compressed,size,method,crc}=entry;
    if(local+30>bytes.length || view.getUint32(local,true)!==0x04034b50) throw new Error('Excel 파일 일부가 손상되었습니다.');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+compressed>bytes.length)throw new Error('Excel 파일 일부가 누락되었습니다.');
    let data=bytes.subarray(start,start+compressed);
    if(method===8){
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(); const parts=[]; let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size||length>2*1024*1024){await reader.cancel();throw new Error('Excel 압축 해제 크기 제한을 초과했습니다.');}parts.push(value);}
      data=new Uint8Array(length);let cursor=0;for(const part of parts){data.set(part,cursor);cursor+=part.length;}
    }
    if(data.length!==size || formCrc(data)!==crc)throw new Error('Excel 파일 데이터가 손상되었습니다. 다시 저장해 주세요.');
    const xml=formDecode.decode(data);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('지원하지 않는 XML 형식의 Excel입니다.');
    // Excel 작성 도구에 따라 <sheet> 또는 <x:sheet>로 저장됩니다. 속성 r:id는 유지합니다.
    return xml.replace(/(<\/?)[A-Za-z_][\w.-]*:/g,'$1');
  };
}
const formLabel = text => text.replace(/[\s:*：]/g,'').replace(/\((필수|선택)\)$/,'');
const formPosition = address => {const match=address.match(/^([A-Z]+)(\d+)$/);if(!match)return null;let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;return {col,row:Number(match[2])};};
export async function extractApplicationXlsx(bytes) {
  if(!bytes.length)throw new Error('빈 파일입니다. 신청서가 들어 있는 .xlsx 파일을 선택해 주세요.');
  const read=await formArchive(bytes), workbook=await read('xl/workbook.xml'), rels=await read('xl/_rels/workbook.xml.rels');
  if(!workbook||!rels)throw new Error('신청서 Excel 형식이 아닙니다. .xlsx 파일을 확인해 주세요.');
  const shared=await read('xl/sharedStrings.xml'), strings=[];
  if(shared)for(const match of shared.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g))strings.push([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>formText(m[1])).join(''));
  const styles=await read('xl/styles.xml'), dateFormats=new Set([14,15,16,17,18,19,20,21,22]), xfs=[];
  if(styles){for(const m of styles.matchAll(/<numFmt\b[^>]*\/?\s*>/g)){const f=formText(formAttr(m[0],'formatCode')).replace(/"[^"]*"|\[[^\]]*\]/g,'');if(/[yd]/i.test(f))dateFormats.add(Number(formAttr(m[0],'numFmtId')));}const body=styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1]||'';for(const m of body.matchAll(/<xf\b[^>]*>/g))xfs.push(Number(formAttr(m[0],'numFmtId')));}
  const links=new Map();for(const m of rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)){if(formAttr(m[0],'TargetMode')==='External')continue;const target=formAttr(m[0],'Target');links.set(formAttr(m[0],'Id'),target.startsWith('/')?target.slice(1):'xl/'+target);}
  const candidates={};let cellsSeen=0, receiptFromD3='';
  for(const m of workbook.matchAll(/<sheet\b[^>]*\/?\s*>/g)){
    const path=links.get(formAttr(m[0],'r:id'));if(!path||!/^xl\/worksheets\//.test(path))continue;const xml=await read(path);if(!xml)continue;
    const cells=new Map(), merges=[];
    for(const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      if(++cellsSeen>10000)throw new Error('셀 수가 너무 많습니다. 신청서 시트만 포함한 파일을 사용해 주세요.');
      const p=formPosition(formAttr(c[1],'r'));if(!p||p.col>200||p.row>2000)continue;const body=c[2]||'';if(/<f\b/.test(body))continue;
      const type=formAttr(c[1],'t'), raw=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]||'';
      let value=type==='s'?(strings[Number(raw)]||''):type==='inlineStr'?[...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t=>formText(t[1])).join(''):formText(raw);
      if(type==='e')continue;
      if(value && !['s','str','inlineStr'].includes(type) && dateFormats.has(xfs[Number(formAttr(c[1],'s')||0)])){
        const serial=Number(value);if(Number.isFinite(serial)){const epoch=/date1904=["'](?:1|true)["']/.test(workbook)?Date.UTC(1904,0,1):Date.UTC(1899,11,30);value=new Date(epoch+Math.floor(serial)*86400000).toISOString().slice(0,10);}
      }
      cells.set(`${p.row},${p.col}`,{...p,value:value.trim()});
    }
    for(const merge of xml.matchAll(/<mergeCell\b[^>]*\/?\s*>/g)){const [a,b]=formAttr(merge[0],'ref').split(':').map(formPosition);if(a&&b)merges.push({a,b});}
    const labelKey = value => Object.entries(formFields).find(([,labels])=>labels.includes(formLabel(value)))?.[0];
    // 신청서 시트의 D3가 최우선입니다. 다른 항목은 기존 라벨 탐색을 유지합니다.
    if(!receiptFromD3 && [...cells.values()].some(cell=>labelKey(cell.value))) receiptFromD3=cells.get('3,4')?.value || '';
    const privateLabel = value => /^(성명|신청인|생년월일|주소|전화번호|연락처|이메일|전자우편)$/.test(formLabel(value));
    for(const cell of cells.values()){
      const key=labelKey(cell.value);if(!key)continue;
      const merged=merges.find(range=>range.a.row===cell.row&&range.a.col===cell.col), end=merged?.b||cell;
      let value='';
      // 병합된 라벨의 오른쪽부터 찾고, 없으면 바로 아래의 값을 읽습니다.
      for(let col=end.col+1;col<=Math.min(200,end.col+8);col++){
        const next=cells.get(`${cell.row},${col}`);if(!next?.value)continue;if(labelKey(next.value)||privateLabel(next.value))break;value=next.value;break;
      }
      if(!value)for(let row=end.row+1;row<=Math.min(2000,end.row+2);row++){
        const next=cells.get(`${row},${cell.col}`);if(!next?.value)continue;if(labelKey(next.value)||privateLabel(next.value))break;value=next.value;break;
      }
      if(value){(candidates[key] ||= new Set()).add(value);}
    }
  }
  const fields={},warnings=[];
  for(const key of Object.keys(formFields)){
    if(key==='receiptNumber' && receiptFromD3){fields[key]=receiptFromD3;continue;}
    const values=[...(candidates[key]||[])];fields[key]=values.length===1?values[0]:'';
    if(!values.length)warnings.push(`신청서에서 '${formNames[key]}' 항목 값을 찾지 못했습니다. 확인 후 입력하거나 직접 입력 방식을 이용해 주세요.`);
    else if(values.length>1)warnings.push(`${formNames[key]} 값이 여러 개여서 자동 선택하지 않았습니다. 직접 확인해 입력해 주세요.`);
  }
  if(!Object.keys(candidates).length)throw new Error('공공데이터 제공 신청서 형식이 아닙니다. 필요한 라벨을 찾지 못했습니다. 직접 입력 방식을 이용해 주세요.');
  if(Object.values(fields).some(text=>text.length>10000))throw new Error('추출한 내용이 너무 깁니다. 직접 입력 방식에서 필요한 내용을 정리해 주세요.');
  return {fields,warnings};
}
export async function applicationUploadResponse(request,env) {
  const fail=(error,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return fail('POST 요청만 가능합니다.',405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('이 홈페이지에서 업로드해 주세요.',403);
  if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return fail('신청서 파일을 선택해 주세요.',415);
  try{
    const reader=request.body?.getReader();if(!reader)return fail('빈 파일입니다.');const parts=[];let length=0;
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024+16000){await reader.cancel();return fail('2MB 이하의 신청서 파일을 선택해 주세요.',413);}parts.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData();
    if(!env.PRACTICE_ACCESS_CODE||form.get('accessCode')!==env.PRACTICE_ACCESS_CODE)return fail('실습 접속코드를 확인해 주세요.',401);
    const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||!file.name.toLowerCase().endsWith('.xlsx'))return fail('.xlsx 신청서 파일만 업로드할 수 있습니다.');
    if(file.size>2*1024*1024)return fail('2MB 이하의 신청서 파일을 선택해 주세요.',413);
    const result=await extractApplicationXlsx(new Uint8Array(await file.arrayBuffer()));
    const secrets=Object.entries(env).filter(([k,v])=>/KEY|TOKEN|SECRET|PASSWORD|ACCESS_CODE/i.test(k)&&typeof v==='string'&&v).map(([,v])=>v);
    if(Object.values(result.fields).some(text=>secrets.some(s=>text.includes(s))))return fail('추출한 내용에 서버 비밀값이 포함되어 있어 표시할 수 없습니다.');
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){const known=/Excel|신청서|파일|라벨|내용|압축|셀 수|XML|빈 파일/.test(String(error.message));return fail(known?error.message:'손상된 Excel이거나 읽을 수 없는 형식입니다. .xlsx로 다시 저장해 주세요.');}
}

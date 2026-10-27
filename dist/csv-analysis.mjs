// 브라우저/Node 공용 순수 분석기. 데이터 행·셀 값은 결과에 포함하지 않습니다.
export const CSV_LIMITS = Object.freeze({bytes:5*1024*1024,rows:50000,columns:200,cell:20000});
export function analyzeCsv(buffer, fileName, selectedEncoding='auto') {
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(!/\.csv$/i.test(fileName))throw Error('CSV 파일만 선택하세요.');
  if(!bytes.length)throw Error('빈 파일입니다.');
  if(bytes.length>CSV_LIMITS.bytes)throw Error('CSV는 5MB 이하만 처리합니다.');
  let text,encoding=selectedEncoding;
  try {
    if(encoding==='auto'){
      if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';
      else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
      else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8';}catch{throw Error('UTF-8로 읽을 수 없습니다. 원본 인코딩을 확인하여 CP949 등을 직접 선택하세요.');}}
    }
    if(!['utf-8','euc-kr','utf-16le','utf-16be'].includes(encoding))throw Error('지원하지 않는 인코딩입니다.');
    text??=new TextDecoder(encoding,{fatal:true}).decode(bytes);
  }catch(e){if(e.message.includes('선택')||e.message.includes('지원'))throw e;throw Error('선택한 인코딩으로 읽지 못했습니다. 인코딩과 파일 손상 여부를 확인하세요.');}
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(text))throw Error('지원하지 않는 제어문자 또는 손상된 문자가 있습니다.');
  text=text.replace(/^\ufeff/,'');
  const columns=[],warnings=[];let header=null,row=[],cell='',quoted=false,closed=false,started=false,count=0;
  const pushCell=()=>{row.push(cell);cell='';closed=false;started=false;if(row.length>CSV_LIMITS.columns)throw Error('컬럼은 최대 200개입니다.');};
  const consume=()=>{
    if(row.every(v=>v==='')){row=[];return;}
    if(!header){header=row.map(v=>v.trim());if(header.some(v=>!v))throw Error('빈 컬럼명이 있습니다.');if(header.some(v=>v.length>200))throw Error('컬럼명은 200자 이내여야 합니다.');if(new Set(header.map(v=>v.normalize('NFKC').toLowerCase())).size!==header.length)throw Error('중복 컬럼명이 있습니다.');header.forEach(name=>columns.push({name,type:'빈값',missingCount:0,kinds:new Set()}));}
    else {count++;if(count>CSV_LIMITS.rows)throw Error('데이터는 최대 50,000행입니다.');if(row.length!==header.length)throw Error(`데이터 ${count}행의 컬럼 수가 제목행과 다릅니다. 쉼표 구분 CSV인지 확인하세요.`);row.forEach((raw,i)=>{const v=raw.trim(),c=columns[i];if(!v){c.missingCount++;return;}let type='문자열';if(/^[+-]?\d+(\.\d+)?$/.test(v)&&!/^0\d/.test(v))type=/\./.test(v)?'실수':'정수';else if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)type='날짜';else if(/^(true|false)$/i.test(v))type='불리언';c.kinds.add(type);});}
    row=[];
  };
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}
    else if(ch===','){pushCell();}
    else if(ch==='\n'||ch==='\r'){pushCell();consume();if(ch==='\r'&&text[i+1]==='\n')i++;}
    else if(ch==='"'){if(started||closed)throw Error('따옴표 위치가 올바르지 않습니다.');quoted=true;started=true;}
    else {if(closed)throw Error('닫는 따옴표 뒤에 구분자가 필요합니다.');cell+=ch;started=true;}
    if(cell.length>CSV_LIMITS.cell)throw Error('셀은 최대 20,000자입니다.');
  }
  if(quoted)throw Error('닫히지 않은 따옴표가 있습니다.');
  if(cell||row.length||started||closed){pushCell();consume();}
  if(!header)throw Error('CSV 제목행을 찾지 못했습니다.');
  if(!count)warnings.push('제목행만 있고 데이터 행은 없습니다.');
  if(encoding!=='utf-8')warnings.push('인코딩은 선택값 또는 BOM 기준입니다. 원문이 올바르게 읽혔는지 확인하세요.');
  return {fileName,fileSize:bytes.length,encoding,delimiter:',',rowCount:count,columnCount:header.length,columns:columns.map(({kinds,...c})=>({...c,type:kinds.size===0?'빈값':kinds.size===1?[...kinds][0]:[...kinds].every(k=>['정수','실수'].includes(k))?'실수':'혼합',missingRate:count?Number((c.missingCount/count*100).toFixed(2)):0})),warnings};
}

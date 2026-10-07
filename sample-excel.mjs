// 서버 전용: 컬럼명만 사용하며 API 호출 없이 작은 OOXML(.xlsx) 파일을 만듭니다.
const excelNotice = '본 파일은 공공데이터 제공신청 업무 지원을 위한 샘플 파일이며 실제 행정자료가 아닙니다.';
const excelEncode = new TextEncoder();
const excelXml = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function excelZip(files) {
  // 압축하지 않은 표준 ZIP. 작은 샘플 파일이므로 외부 패키지가 필요 없습니다.
  const local = [], central = []; let offset = 0, centralLength = 0;
  const header = size => { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; };
  for (const [path, xml] of Object.entries(files)) {
    const name = excelEncode.encode(path), data = excelEncode.encode(xml);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const [a, av] = header(30); av.setUint32(0, 0x04034b50, true); av.setUint16(4, 20, true); av.setUint16(12, 33, true);
    av.setUint32(14, crc, true); av.setUint32(18, data.length, true); av.setUint32(22, data.length, true); av.setUint16(26, name.length, true);
    local.push(a, name, data);
    const [b, bv] = header(46); bv.setUint32(0, 0x02014b50, true); bv.setUint16(4, 20, true); bv.setUint16(6, 20, true); bv.setUint16(14, 33, true);
    bv.setUint32(16, crc, true); bv.setUint32(20, data.length, true); bv.setUint32(24, data.length, true); bv.setUint16(28, name.length, true); bv.setUint32(42, offset, true);
    central.push(b, name); centralLength += b.length + name.length; offset += a.length + name.length + data.length;
  }
  const [end, ev] = header(22); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length / 2, true); ev.setUint16(10, central.length / 2, true); ev.setUint32(12, centralLength, true); ev.setUint32(16, offset, true);
  const bytes = new Uint8Array(offset + centralLength + end.length); let cursor = 0;
  for (const part of [...local, ...central, end]) { bytes.set(part, cursor); cursor += part.length; } return bytes;
}
export function createSampleExcel(names) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheet = (rows, guide = false) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0">${guide ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews><cols><col min="1" max="${rows[0].length}" width="${guide ? 100 : 30}" customWidth="1"/></cols><sheetData>${rows.map((row, r) => `<row r="${r+1}" ht="${guide ? 60 : r === 0 ? 45 : 36}" customHeight="1">${row.map((value, c) => `<c r="${String.fromCharCode(65+c)}${r+1}" t="inlineStr" s="${r === 0 && !guide ? 1 : 0}"><is><t xml:space="preserve">${excelXml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const title = names.some(n => /문화재|유산/.test(n)) ? '문화재_샘플' : '제공신청_샘플';
  const rows = [names, ...Array.from({length: 3}, () => names.map(() => '예시값(가상자료)'))];
  return excelZip({
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${[1,2].map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${title}" sheetId="1" r:id="rId1"/><sheet name="안내" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF126A56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': sheet(rows),
    'xl/worksheets/sheet2.xml': sheet([[excelNotice], ['모든 데이터 셀은 가상 예시입니다. 실제 값·보유 여부는 추가 확인 필요입니다.']], true),
  });
}
export async function sampleExcelResponse(request, env) {
  const fail = (error, status) => Response.json({error}, {status, headers:{'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return fail('POST 요청만 가능합니다.', 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('이 홈페이지에서 생성해 주세요.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail('잘못된 요청 형식입니다.', 415);
  let data;
  try {
    const reader = request.body?.getReader(); if (!reader) return fail('컬럼 정보가 없습니다.',400);
    const parts = []; let length = 0;
    while (true) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > 16000) { await reader.cancel(); return fail('요청이 너무 큽니다.',413); } parts.push(value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) {bytes.set(part,offset); offset += part.length;}
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return fail('요청 형식을 확인해 주세요.',400); }
  if (!env.PRACTICE_ACCESS_CODE || data?.accessCode !== env.PRACTICE_ACCESS_CODE) return fail('실습 접속코드를 확인해 주세요.',401);
  const names = data.columns;
  const secrets = Object.entries(env).filter(([k,v]) => /KEY|TOKEN|SECRET|PASSWORD|ACCESS_CODE/i.test(k) && typeof v === 'string' && v).map(([,v]) => v);
  if (!Array.isArray(names) || names.length < 1 || names.length > 12 || names.some(n => typeof n !== 'string' || !n.trim() || n.length > 2500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(n) || secrets.some(s => n.includes(s)))) return fail('현재 분석 결과의 컬럼명을 확인해 주세요.',400);
  return new Response(createSampleExcel(names), {headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':"attachment; filename=public-data-sample.xlsx; filename*=UTF-8''" + encodeURIComponent('공공데이터_제공신청_샘플.xlsx'),'Cache-Control':'no-store'}});
}

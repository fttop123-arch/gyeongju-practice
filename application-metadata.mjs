// 신청 건 식별정보만 전달합니다. DB/파일 저장이나 개인정보 필드는 없습니다.
export function applicationMetadata(value, env = {}) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('신청 건 정보 형식을 확인해 주세요.');
  const limits = {receiptNumber:80,receiptDate:40,dataName:300,purpose:700};
  const result = {};
  const secrets = Object.entries(env).filter(([k,v])=>/KEY|TOKEN|SECRET|PASSWORD|ACCESS_CODE/i.test(k)&&typeof v==='string'&&v).map(([,v])=>v);
  for (const [key,limit] of Object.entries(limits)) {
    const text = value[key] ?? '';
    if (typeof text !== 'string' || text.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || secrets.some(s=>text.includes(s))) throw new Error('신청 건 정보의 길이와 내용을 확인해 주세요.');
    result[key] = text.trim();
  }
  return result;
}

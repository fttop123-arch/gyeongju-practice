// 분류체계DB는 읽기만 합니다. .env/조직도/API를 사용하지 않습니다.
import {loadRegistrationCatalog} from './registration-catalog.mjs';
import {writeFile} from 'node:fs/promises';
const c=await loadRegistrationCatalog();
await writeFile(new URL('./internal-rpa/분류체계.json',import.meta.url),JSON.stringify({source:c.source,version:c.version,majorCount:c.majorCount,minorCount:c.minorCount,entries:c.entries},null,2));
console.log(`RPA 참조 목록 준비 완료: 대분류 ${c.majorCount} / 중분류 ${c.minorCount} (원본 DB 변경 없음)`);

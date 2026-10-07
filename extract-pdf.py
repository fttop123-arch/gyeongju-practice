"""PDF 원본은 읽기만 하고, 페이지별 텍스트를 UTF-8 JSON으로 저장합니다."""
import json
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parent
reader = PdfReader(root / 'data/ai_challenge_guide.pdf')
pages = [{'page': i + 1, 'text': (page.extract_text() or '').strip()} for i, page in enumerate(reader.pages)]
total = sum(len(page['text']) for page in pages)
if total < 500 or any(len(page['text']) < 20 for page in pages):
    raise SystemExit('PDF 텍스트가 부족합니다. OCR 없이 진행할 수 있는 문서인지 확인해 주세요.')
(root / 'data/pdf-text.json').write_text(json.dumps({'document': 'ai_challenge_guide.pdf', 'pages': pages}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'PDF 추출 성공: {len(pages)}페이지, {total}자')

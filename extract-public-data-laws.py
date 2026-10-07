"""법령 PDF는 읽기만 하고 페이지와 조문 제목을 보존한 텍스트를 저장합니다."""
import json
import re
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parent
documents = []
for filename, name in [
    ('public_data_act.pdf', '공공데이터의 제공 및 이용 활성화에 관한 법률'),
    ('public_data_act_enforcement_decree.pdf', '공공데이터의 제공 및 이용 활성화에 관한 법률 시행령'),
]:
    pages = []
    for i, page in enumerate(PdfReader(root / 'data' / filename).pages):
        text = (page.extract_text() or '').strip()
        if len(text) < 30:
            raise SystemExit(f'{filename} {i+1}페이지 텍스트가 부족합니다. OCR 없이 진행할 수 없습니다.')
        pages.append({'page': i + 1, 'text': text})
    if sum(len(p['text']) for p in pages) < 500:
        raise SystemExit(f'{filename} 텍스트가 부족합니다. 진행을 중단합니다.')
    # 페이지가 바뀌어도 이어지는 조문은 합치고, 각 줄의 원래 PDF 페이지를 보존합니다.
    articles, current = [], None
    for page in pages:
        for line in page['text'].splitlines():
            line = line.strip()
            if not line or line.startswith('법제처') or line == name or re.match(r'^제\d+장\s', line):
                continue
            if line.startswith('부칙') or line.startswith('별표'):
                current = None
                break
            heading = re.match(r'^(제\d+조(?:의\d+)?\([^)]*\))', line)
            if heading:
                current = {'article': heading[1], 'lines': []}
                articles.append(current)
            if current:
                current['lines'].append({'page': page['page'], 'text': line})
        if any(line.strip().startswith('부칙') for line in page['text'].splitlines()):
            break
    if not articles:
        raise SystemExit(f'{filename} 조문 제목을 읽지 못했습니다.')
    documents.append({'document': filename, 'documentName': name, 'pages': pages, 'articles': articles})
    print(f'{filename}: {len(pages)}페이지, {sum(len(p["text"]) for p in pages)}자, 본문 {len(articles)}개 조문')
(root / 'data' / 'public-data-laws-text.json').write_text(json.dumps({'documents': documents}, ensure_ascii=False, indent=2), encoding='utf-8')

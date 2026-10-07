// 업무 카드 표시만 담당합니다. API 키나 서버 설정을 사용하지 않습니다.
window.renderPublicDataAnalysis = function (analysis, target) {
  target.replaceChildren();
  const notice = document.createElement('p'); notice.className = 'public-data-notice';
  notice.textContent = '신청내용을 정리한 검토용 초안입니다. 실제 데이터 조회 결과가 아닙니다. 확인되지 않은 항목은 추가 확인 필요이며, 예시값은 실제 현황이 아닙니다.';
  target.append(notice);
  const card = title => {
    const section = document.createElement('section'); section.className = 'public-data-card';
    const heading = document.createElement('h3'); heading.textContent = title; section.append(heading); target.append(section); return section;
  };
  const paragraph = (title, value) => { const section = card(title); const p = document.createElement('p'); p.textContent = value; section.append(p); };
  const bullets = (title, values) => { const section = card(title); const ul = document.createElement('ul'); for (const value of values) { const li = document.createElement('li'); li.textContent = value; ul.append(li); } section.append(ul); };
  paragraph('신청 취지 요약', analysis.summary);
  bullets('신청인이 원하는 정보', analysis.requestedInfo);
  bullets('담당부서가 준비해야 할 데이터', analysis.departmentData);
  const section = card('권장 데이터 컬럼');
  const scroll = document.createElement('div'); scroll.className = 'public-data-table-wrap'; scroll.tabIndex = 0; scroll.setAttribute('aria-label', '권장 데이터 컬럼 표. 좁은 화면에서는 좌우로 스크롤하세요.');
  const table = document.createElement('table'); const caption = document.createElement('caption'); caption.textContent = '제안 컬럼 — 실제 보유 여부와 값은 추가 확인 필요'; table.append(caption);
  const thead = document.createElement('thead'); const tr = document.createElement('tr');
  for (const label of ['컬럼명', '의미', '예시값', '비고 또는 확인 필요사항']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; tr.append(th); }
  thead.append(tr); table.append(thead); const tbody = document.createElement('tbody');
  for (const column of analysis.columns) { const row = document.createElement('tr'); for (const key of ['name','meaning','example','notes']) { const td = document.createElement('td'); td.textContent = column[key]; row.append(td); } tbody.append(row); }
  table.append(tbody); scroll.append(table); section.append(scroll);
  bullets('추가 확인사항', analysis.checks);
  bullets('제공 시 주의사항', analysis.cautions);
  paragraph('담당부서 전달용 요청문 초안', analysis.departmentDraft);
  target.hidden = false;
};

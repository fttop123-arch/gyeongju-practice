// 업무 카드 표시만 담당합니다. API 키나 서버 설정을 사용하지 않습니다.
window.renderPublicDataAnalysis = function (analysis, target, lawResult = {}) {
  target.replaceChildren();
  const notice = document.createElement('p'); notice.className = 'public-data-notice';
  notice.textContent = '신청내용을 정리한 검토용 초안입니다. 실제 데이터 조회 결과가 아닙니다. 확인되지 않은 항목은 추가 확인 필요이며, 예시값은 실제 현황이 아닙니다.';
  target.append(notice);
  if (lawResult.application) {
    const identification = document.createElement('p'); identification.className = 'public-data-notice application-identification';
    identification.textContent = `접수번호: ${lawResult.application.receiptNumber || '추가 확인 필요'} · 공공데이터 명칭: ${lawResult.application.dataName || '추가 확인 필요'}`;
    target.append(identification);
  }
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
  const legal = document.createElement('section'); legal.className = 'public-data-law-evidence';
  const title = document.createElement('h3'); title.textContent = '관련 법령 근거'; legal.append(title);
  const warning = document.createElement('p'); warning.textContent = '본 분석은 공공데이터 제공신청 업무를 지원하기 위한 참고용이며, 실제 제공 여부는 관련 법령과 기관의 검토를 통해 최종 판단해야 합니다.'; legal.append(warning);
  const support = document.createElement('p'); support.textContent = lawResult.lawStatus || '법령 문서에서 직접 확인되지 않음'; legal.append(support);
  const scope = document.createElement('p'); scope.textContent = '프로젝트에 넣은 법령 PDF 본문 기준입니다. 최신 개정 여부와 실제 적용은 별도로 확인하세요. 아래 검색 후보와 답변에서 인용한 근거를 구분해 표시합니다.'; legal.append(scope);
  for (const hit of lawResult.lawEvidence || []) {
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = `[근거 ${hit.rank}] ${hit.documentName} · ${hit.article} · PDF ${hit.pages.join(', ')}페이지 · ${hit.quotes.length ? '답변 참조 근거(PDF 원문)' : '검색 후보'}`;
    const score = document.createElement('p'); score.textContent = `코사인 ${hit.cosineScore.toFixed(3)} · 단어 점수 ${hit.keywordScore.toFixed(3)} · 범위 제목 보조점수 ${hit.scopeBonus.toFixed(3)} · 최종 점수 ${hit.score.toFixed(3)} (코사인 + 0.35 × 단어 점수 + 제목 보조점수)`;
    const preview = document.createElement('p'); preview.textContent = (hit.quotes.length ? '답변의 근거 원문(앞부분): ' : '검색 후보 원문(앞부분): ') + hit.preview;
    details.append(summary,score,preview);
    legal.append(details);
  }
  target.append(legal);
  const actions = document.createElement('div'); actions.className = 'public-data-export';
  const download = document.createElement('button'); download.type = 'button'; download.textContent = '샘플 Excel 생성';
  const status = document.createElement('p'); status.setAttribute('role','status');
  status.textContent = '현재 권장 컬럼으로 가상자료 3행과 안내 시트를 만듭니다.';
  actions.append(download, status); target.append(actions);
  download.addEventListener('click', async () => {
    download.disabled = true; status.textContent = 'Excel 파일을 생성하고 있습니다.';
    try {
      const response = await fetch('/api/sample-excel', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({columns:analysis.columns.map(column => column.name), accessCode:document.getElementById('ai-access-code').value.trim(), ...(lawResult.application ? {application:lawResult.application} : {})}), signal:AbortSignal.timeout(15000)});
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Excel 생성에 실패했습니다.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = '공공데이터_제공신청_샘플.xlsx'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = '다운로드했습니다. 실제 행정자료가 아닌 가상 샘플입니다.';
    } catch (error) { status.textContent = error.name === 'TimeoutError' ? '생성 시간이 초과되었습니다. 다시 시도해 주세요.' : error.message; }
    finally { download.disabled = false; }
  });
  target.hidden = false;
};

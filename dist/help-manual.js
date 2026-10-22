// 도움말 문구는 아래 publicDataManual 배열에서 수정합니다. AI/API를 사용하지 않습니다.
// 업무기준 확인·실무 참고·추가 확인 필요 메모는 확정 규정과 구분합니다.
const publicDataManual = [
  { label:'접수', icon:'◎', titleKo:'신청 접수 전 확인', intro:'이미 제공되는 데이터인지, 검토를 요청할 부서가 어디인지 먼저 확인합니다.', sections:[
    {title:'0-0. 전국표준데이터 여부 확인', items:['신청된 데이터가 공공데이터포털의 전국표준데이터 등으로 이미 제공되는지 확인합니다.'], flow:['포털 신청 건 확인','담당자 확인 → 접수','제공신청서 다운로드']},
    {title:'0-1. 담당부서 확인',items:['실제 데이터 보유 여부를 확인할 담당부서를 파악합니다.','필요한 경우 담당부서가 확인해야 할 예상 필드명을 정리합니다.','담당부서가 불명확하면 서무담당자를 통해 전달할 수 있습니다.'],note:{type:'주의',text:'데이터 담당자가 공개·제공 여부를 임의로 판단하지 않고, 실제 업무 담당부서에 제공 가능 여부 검토를 요청합니다.'}}
  ]},
  { label:'부서검토', icon:'↗', titleKo:'담당부서 검토 요청',intro:'담당부서에 검토를 요청하고 등록 여부와 처리기한을 확인합니다.',sections:[
    {title:'검토 요청 공문',items:['담당부서에 “공공데이터 제공신청 검토 요청” 공문을 발송합니다.','관련 데이터가 공공데이터포털에 기존 등록되어 있는지 확인합니다.']},
    {title:'처리기한 및 연장 확인',note:{type:'업무기준 확인',text:'내부 참고내용: 처리기한 10일, 1회 연장 가능. 실제 처리 시 관련 규정 및 포털 표시기한을 확인하세요. 이 메모만으로 기산점·연장 기간·적용 조건을 확정하지 않습니다.'}}
  ]},
  {label:'제공',icon:'✓',titleKo:'제공·부분제공 처리',intro:'담당부서 자료 수신부터 데이터 등록, 결정 통지와 처리상태 확인까지 진행합니다.',sections:[
    {title:'2-1. 제공 결정',items:['기존 전국표준데이터 등으로 이미 제공 중인 자료라면 기존 처리문서를 참고할 수 있습니다.']},
    {title:'2-1-1. 담당부서 자료 수신 및 데이터 등록',items:['담당부서로부터 검토 공문과 제공 데이터 파일을 수신합니다.'],flow:['목록등록관리','데이터등록','파일데이터 등록','제공신청여부 “신청”','신청번호 검색 및 매핑','등록','실무자 검토확인'],after:'등록 후 공공데이터포털 반영 여부를 확인합니다.'},
    {title:'2-1-2. 포털 처리결과 등록',flow:['포털','신청관리','데이터제공신청','처리결과 등록','제공방법 등 입력','조회','저장','등록'],items:['데이터 등록 확인 후 위 순서로 처리합니다.','온나라에서 신청인에게 보낼 결정 통지 관련 품의를 진행합니다.','결재 완료 후 목록관리 시스템의 처리상태가 “처리”인지 확인하고 업무를 종료합니다.']},
    {title:'2-1-3. 부분제공',items:['신청항목 중 제공할 수 없는 열 전체가 있으면 해당 열을 제외한 파일로 등록할 수 있습니다.','부분제공을 선택하고 부분제공 사유 및 내용을 작성합니다.','나머지 처리절차는 제공과 동일합니다.'],note:{type:'실무 참고',text:'일부 자료가 존재할 때 제공/부분제공 여부는 상황에 따라 판단합니다. 일부 값을 단순 마스킹하는 것만으로 제공/부분제공을 구분하는 것은 아닙니다.'}}
  ]},
  {label:'제공불가',icon:'−',titleKo:'제공불가 처리',intro:'검토자료와 제공불가 사유를 확인하고 승인·통지 절차를 진행합니다.',sections:[
    {title:'검토자료 수신',items:['담당부서로부터 검토 공문과 제공불가 사유서를 수신합니다.']},
    {title:'결과 등록 및 승인',flow:['포털 처리결과','제공불가 등록','결재받은 공문 첨부','저장','제공불가 승인']},
    {title:'공문 발송 및 종료 확인',items:['신청자 및 필요한 관계기관에 공문을 발송합니다.','결재 시 결정통보서 내용을 참고하여 공문에 주요 내용을 요약합니다.','완료여부 또는 처리상태가 “처리”인지 확인하고 종료합니다.']}
  ]},
  {label:'목록삭제',icon:'⌑',titleKo:'목록 삭제',intro:'삭제 전 기존 처리사례와 해당 사이트의 매뉴얼을 확인합니다.',sections:[
    {title:'기존 사례·서식 확인',note:{type:'추가 확인 필요',text:'현재 메모: “사이트 매뉴얼 첨부5 서식 확인 필요”. 확정된 절차가 아니므로 실제 삭제 전에 기존 처리사례와 사이트 매뉴얼의 해당 서식을 확인하세요.'}}
  ]}
];

(() => {
 const open = document.getElementById('manual-open');
 if (!open) return;
 const dialog = document.createElement('dialog');dialog.className='manual-dialog';dialog.id='public-data-manual';dialog.setAttribute('aria-labelledby','manual-title');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const header=el('header','manual-header');const heading=el('div');heading.append(el('span','manual-eyebrow','DESK GUIDE · 업무 참고'),el('h2','','공공데이터 제공신청 업무 가이드'));heading.querySelector('h2').id='manual-title';
 const close=el('button','manual-close','닫기 ✕');close.type='button';close.setAttribute('aria-label','도움말 닫기');close.addEventListener('click',()=>dialog.close());header.append(heading,close);
 const nav=el('nav','manual-nav');nav.setAttribute('aria-label','업무 단계 바로가기');
 const body=el('div','manual-body');body.append(el('p','manual-disclaimer','제공해 주신 업무 메모를 정리한 참고용 가이드입니다. 실제 처리 시 관련 규정·포털 표시기한·기관의 업무기준을 확인하세요.'));
 publicDataManual.forEach((step,i)=>{
   const detail=el('details','manual-step');detail.id='manual-step-'+i;detail.open=i===0;
   const summary=el('summary');summary.append(el('span','manual-number',String(i).padStart(2,'0')),el('span','manual-step-title',step.titleKo),el('span','manual-step-icon',step.icon));detail.append(summary);
   const content=el('div','manual-content');content.append(el('p','manual-intro',step.intro));
   for(const s of step.sections){const card=el('section','manual-section');card.append(el('h3','',s.title));
     if(s.items){const list=el('ul');for(const item of s.items)list.append(el('li','',item));card.append(list);}
     if(s.flow){const list=el('ol','manual-flow');list.setAttribute('aria-label',s.title+' 이동 순서');for(const item of s.flow)list.append(el('li','',item));card.append(list);}
     if(s.after)card.append(el('p','manual-after',s.after));
     if(s.note){const note=el('aside','manual-note'+(s.note.type==='주의'?' caution':''));note.append(el('span','manual-note-badge',s.note.type),el('p','',s.note.text));card.append(note);}content.append(card);
   }detail.append(content);body.append(detail);
   const button=el('button','manual-jump',step.label);button.type='button';button.addEventListener('click',()=>{detail.open=true;detail.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});nav.append(button);
 });
 dialog.append(header,nav,body);document.body.append(dialog);
 open.addEventListener('click',()=>{dialog.showModal();document.body.classList.add('manual-is-open');});
 dialog.addEventListener('close',()=>{document.body.classList.remove('manual-is-open');open.focus();});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
})();

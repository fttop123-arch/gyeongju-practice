// 조직도는 로컬 참조 데이터입니다. 이 모듈은 네트워크/LLM/임베딩을 사용하지 않습니다.
const orgClean = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
const orgStop = new Set(['경주','경주시','전체','현황','데이터','공공데이터','제공','신청','제공신청','요청','자료','정보','분석','목록','기준','기준일','담당','담당자','담당부서','부서','업무','담당업무','확인','필요','추가','관리','가상','실습','목적','활용','엑셀','excel','csv','파일','정리','관련','포함','보유','여부','위치','명칭','주소']);
function orgTerms(text) {
  const words=String(text ?? '').normalize('NFKC').toLowerCase().match(/[가-힣a-z0-9]+/g)||[];
  const terms=[];
  for(const word of words){
    if(word.length>=2&&!orgStop.has(word)&&!/^\d+$/.test(word))terms.push(word);
    let clean=word;
    // 붙여 쓴 업무명+담당자, 담당자는 등도 업무명으로 검색합니다.
    for(let i=0;i<3;i++){
      const next=clean.replace(/(해주세요|알려주세요|주세요|싶습니다|원합니다|담당부서|담당업무|담당자|담당|받고|위한|대한|으로|에서|까지|관련|데이터|현황|정보|자료|목록|위치|면수|의|을|를|은|는|이|가|와|과)$/,'');
      if(next===clean)break;
      clean=next;
      if(clean.length>=2&&!orgStop.has(clean)&&!/^\d+$/.test(clean))terms.push(clean);
    }
  }
  // 설명 가능한 업무용 검색어 보조 확장입니다. 부서나 사람을 강제로 지정하지 않습니다.
  const clean=orgClean(text);
  if(/주차/.test(clean))terms.push('주차장');
  if(/가로등|보안등/.test(clean))terms.push('가로등','보안등');
  if(/쓰레기|폐기물/.test(clean))terms.push('쓰레기','폐기물');
  if(/가로수길/.test(clean))terms.push('가로수');
  return [...new Set(terms)].slice(0,60);
}
export function recommendOrganization({question,analysis,organization,limit=5}) {
  const empty={status:organization?.employees?.length?'no-match':'unavailable',message:organization?.employees?.length?'조직도에서 관련 담당자를 찾지 못했습니다.':'조직도 참조 데이터가 준비되지 않았습니다. 조직도 Excel을 변환하고 서버를 재시작해 주세요.',candidates:[]};
  if(!organization?.employees?.length)return empty;
  const primary=orgTerms(question);
  const auxiliary=orgTerms([analysis?.summary,...(analysis?.requestedInfo||[]),...(analysis?.departmentData||[]),...(analysis?.columns||[]).map(c=>c.name)].filter(v=>typeof v==='string').join(' '));
  const terms=[...new Set([...primary,...auxiliary])];if(!terms.length)return empty;
  const scored=organization.employees.map((employee,index)=>{
    const duty=orgClean(employee.duties),dept=orgClean(employee.department),team=orgClean(employee.team);
    const matches=[];let score=0, directScore=0;
    for(const term of terms){const fields=[];const weight=primary.includes(term)?2:1;const lengthBonus=Math.min(term.length,8)/4;
      if(duty.includes(term)){fields.push('담당업무');directScore+=(8+lengthBonus)*weight;}
      if(dept.includes(term))fields.push('부서');if(team.includes(term))fields.push('팀');
      if(fields.length){score+=fields.includes('담당업무')?(8+lengthBonus)*weight:0;score+=(fields.includes('부서')?2:0)*weight+(fields.includes('팀')?3:0)*weight;matches.push({keyword:term,fields,source:primary.includes(term)?'신청내용':'분석 결과'});}
    }
    // 신청내용과 직접 겹치는 근거가 없으면 AI 분석의 표현만으로 후보를 만들지 않습니다.
    const hasOriginal=matches.some(m=>m.source==='신청내용');
    return {employee,index,score:hasOriginal?score:0,directScore,matches};
  }).filter(r=>r.score>0).sort((a,b)=>b.directScore-a.directScore||b.score-a.score||Number(a.employee.sortOrder||0)-Number(b.employee.sortOrder||0)||a.index-b.index);
  const seen=new Set();const candidates=[];
  for(const hit of scored){const e=hit.employee;const key=[e.department,e.team,e.name,e.phone,e.duties].join('\u0000');if(seen.has(key))continue;seen.add(key);candidates.push({rank:candidates.length+1,department:e.department||'',team:e.team||'',name:e.name||'',phone:e.phone||'',duties:e.duties||'',score:Number(hit.score.toFixed(2)),matches:hit.matches});if(candidates.length>=Math.min(5,Math.max(1,limit)))break;}
  if(!candidates.length)return empty;
  return {status:'matched',message:'조직도 담당업무를 비교한 담당자 후보입니다. 확정 배정이 아니며 실제 자료 보유 여부와 담당 범위를 확인하세요. 점수는 일치 점수이며 확률이 아닙니다.',updatedAt:organization.updatedAt||'',candidates};
}

// 업로드 결과는 이 화면의 메모리에만 있습니다. 확인 버튼을 눌러야 기존 분석 API를 호출합니다.
(() => {
  const mode = document.getElementById('ai-mode'), method = document.getElementById('application-input-method');
  const panel = document.getElementById('application-upload'), preview = document.getElementById('application-preview');
  const file = document.getElementById('application-file'), status = document.getElementById('application-upload-status');
  const extract = document.getElementById('application-extract'), confirm = document.getElementById('application-confirm');
  const ask = document.querySelector('#ai-form button[type="submit"]'), question = document.getElementById('ai-question');
  const keys = ['receiptNumber','receiptDate','dataName','content','purpose'];
  const uploadMode = () => mode.value === 'public-data' && method.value === 'upload';
  let busy = false, extracting = false;
  function refresh() {
    document.getElementById('application-method').hidden = mode.value !== 'public-data';
    panel.hidden = !uploadMode(); question.hidden = uploadMode();
    document.querySelector('label[for="ai-question"]').hidden = uploadMode(); ask.hidden = uploadMode();
    extract.disabled = busy || extracting;
    confirm.disabled = busy || extracting || ask.disabled || preview.hidden;
  }
  mode.addEventListener('change', refresh); method.addEventListener('change', refresh);
  new MutationObserver(refresh).observe(ask,{attributes:true,attributeFilter:['disabled']});
  file.addEventListener('change', () => {preview.hidden = true;status.textContent = '';refresh();});
  window.applicationUploadBusy = value => {
    busy = value; preview.disabled = value; file.disabled = value; method.disabled = value; mode.disabled = value; refresh();
  };
  window.getApplicationSubmission = () => {
    if (!uploadMode()) return null;
    if (preview.hidden || extracting) throw new Error('먼저 신청서 내용을 추출하고 확인해 주세요.');
    const fields = Object.fromEntries(keys.map(key => [key,document.getElementById('application-'+key).value.trim()]));
    if (!fields.dataName || !fields.content) throw new Error('공공데이터 명칭과 내용을 확인해 입력해 주세요. 직접 입력 방식도 사용할 수 있습니다.');
    const text = `공공데이터 명칭: ${fields.dataName}\n공공데이터 내용: ${fields.content}\n공공데이터 활용 목적: ${fields.purpose || '추가 확인 필요'}`;
    if (text.length > 2000) throw new Error('분석 요청이 2,000자를 넘습니다. 명칭·내용·목적을 짧게 정리해 주세요.');
    const {content,...application} = fields;
    return {question:text,application};
  };
  extract.addEventListener('click', async () => {
    preview.hidden = true; status.textContent = ''; refresh();
    const selected = file.files[0], code = document.getElementById('ai-access-code').value.trim();
    if (!selected) {status.textContent = '신청서 .xlsx 파일을 선택해 주세요.'; return;}
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {status.textContent = '.xlsx 신청서 파일만 업로드할 수 있습니다.';return;}
    if (!selected.size) {status.textContent = '빈 파일입니다. 신청서가 들어 있는 .xlsx 파일을 선택해 주세요.';return;}
    if (selected.size > 2*1024*1024) {status.textContent = '2MB 이하의 신청서 파일을 선택해 주세요.';return;}
    if (!code) {status.textContent = '아래 실습 접속코드를 먼저 입력해 주세요.';document.getElementById('ai-access-code').focus();return;}
    extracting = true; file.disabled = true; method.disabled = true; mode.disabled = true; refresh();
    status.textContent = '신청서 항목을 읽고 있습니다. AI는 아직 호출하지 않습니다.';
    try {
      const body = new FormData(); body.append('file',selected); body.append('accessCode',code);
      const response = await fetch('/api/application-upload',{method:'POST',body,signal:AbortSignal.timeout(30000)});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '신청서 내용을 읽지 못했습니다.');
      for (const key of keys) document.getElementById('application-'+key).value = data.fields[key] || '';
      preview.hidden = false;
      status.textContent = data.warnings.length ? data.warnings.join('\n') : '5개 항목을 추출했습니다. 내용을 확인·수정한 뒤 분석 버튼을 눌러 주세요.';
    } catch (error) {status.textContent = error.name === 'TimeoutError' ? '읽기 시간이 초과되었습니다. 다시 시도해 주세요.' : error instanceof TypeError ? '서버에 연결하지 못했습니다. 로컬 서버에서 열어 주세요.' : error.message;}
    finally {extracting = false;file.disabled = false;method.disabled = false;mode.disabled = false;refresh();}
  });
  confirm.addEventListener('click', () => { if (!confirm.disabled) document.getElementById('ai-form').requestSubmit(ask); });
  refresh();
})();

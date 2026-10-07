# 경북 Open AI Service Hub 연결 테스트

현재는 서버 통신 코드와 테스트 스크립트를 준비했습니다. 실제 연결 성공 여부와 모델 ID는 본인 개발키를 넣고 호출한 뒤 확정합니다. 키가 없는 상태에서 성공했다고 판단하지 않습니다.

## 개발키를 어디에 넣나요?
1. 바탕화면 → AI실습 → gyeongju-practice 폴더를 엽니다.
2. `.env` 파일을 메모장으로 엽니다. 파일이 보이지 않으면 탐색기의 숨긴 항목 표시를 켜세요.
3. `HASA_API_KEY=` 뒤에 본인 개발용 API 키를 붙여 넣고 저장합니다.
4. `LLM_PROVIDER=hasa`, `HASA_BASE_URL=https://open.hasa.re.kr/v1`는 유지합니다.
5. `LLM_MODEL=`은 비워 두세요. 실제 모델 목록 조회 후 테스트 스크립트가 채웁니다.
6. 키 값은 채팅으로 보내지 말고 “.env에 개발키 저장했어”라고만 알려 주세요.

API 키는 `.env`에만 보관합니다. `.gitignore`에 `.env`, `.env.*`가 등록되어 있으며 비밀값이 없는 `.env.example`만 Git에 포함됩니다. 로컬 서버는 `.env`와 서버 코드를 웹에 제공하지 않습니다.

## 먼저 API 연결만 테스트하기
프로젝트 폴더에서 다음을 실행합니다. 추가 패키지 설치는 없습니다.

```powershell
node test-hub.mjs
```

테스트 스크립트는 다음 순서로 처리합니다.
- `.env`에서 개발키를 읽습니다. 키는 출력하지 않습니다.
- `https://open.hasa.re.kr/v1/models`를 호출해 실제 모델 ID를 표시합니다.
- 목록에 있는 EXAONE·Qwen 등 일반 채팅 후보를 선택합니다. 임베딩·리랭킹·OCR·음성·영상 모델은 후보에서 제외합니다.
- `https://open.hasa.re.kr/v1/chat/completions`에 “안녕하세요. 한국어로 짧게 한 문장만 인사해 주세요.”를 보냅니다.
- 정상 답변을 받은 경우에만 `.env`의 모델 ID와 `HUB_CONNECTION_VERIFIED=true`를 저장합니다.
- 접속코드가 비어 있으면 홈페이지 실습용 코드를 별도로 생성해 `.env`에 저장합니다. API 키와 접속코드는 서로 다릅니다.

## 오류를 읽는 방법
실제 API 호출이 실패하면 HTTP 상태와 응답 내용을 표시합니다. API 키만 가리고 오류의 나머지 내용은 확인할 수 있습니다.
- 401: 키 누락·오타·만료 여부 확인
- 403: 개발계정 또는 해당 모델 접근 권한 확인
- 404: API 경로 또는 모델 ID 확인
- 429: 개발계정 요청 한도 또는 서버의 요청 제한 확인
- 5xx: Hub 모델 서버 상태 확인
- 연결 시간 초과·DNS 오류: 인터넷 연결과 게이트웨이 상태 확인

키를 바꾸거나 모델을 바꾸면 테스트를 다시 실행합니다. 성공 여부를 수동으로 true로 바꾸지 마세요.

## 정상 테스트 뒤 홈페이지 연결
웹 화면 → 우리 서버(`/api/ask`) → Service Hub(`/v1/chat/completions`) → LLM → 웹 화면

로컬 서버는 `node --env-file=.env server.mjs`로 실행하고 http://127.0.0.1:8000 에서 확인합니다. 입력창의 실습 접속코드에는 `.env`의 `PRACTICE_ACCESS_CODE` 값을 넣습니다. 키를 입력창에 넣지 않습니다. 종료는 Ctrl+C입니다.
공개 주소 반영은 정상 API 테스트 뒤 서버의 비밀 환경변수에 개발키를 등록하고 같은 사이트에 배포하여 확인합니다. 이번 목표는 연결 테스트이며 운영 전환을 신청하지 않습니다.

## 파일 설명
- `llm-providers.mjs`: Service Hub 채팅 API 연결을 추가했습니다. 공급자별 통신을 분리합니다.
- `api-handler.mjs`: 우리 서버의 요청 검사와 Service Hub 오류 표시입니다.
- `test-hub.mjs`: 실제 모델 목록 조회와 첫 질문 테스트용으로 새로 만들었습니다.
- `.env.example`: 키 없는 Service Hub 설정 예시입니다.
- `.env`: 본인 개발키를 넣는 비공개 파일입니다.
- `.gitignore`: 비밀 파일을 제외하는 기존 설정을 유지합니다.
- `dist/index.html`: 실제 테스트 성공 뒤 공급자 안내와 버튼 연결 상태를 반영합니다.

공식 개발자 센터: https://open.hasa.re.kr/docs
공식 API 문서: https://dolzi-gitc.github.io/GITC-Open-AI-Service-Hub/api/

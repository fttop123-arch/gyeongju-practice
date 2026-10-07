# Gemini 무료 API 연결 실습

Gemini 연결 코드를 준비했습니다. 실제 답변 검증은 본인의 무료 프로젝트 API 키 등록 후 진행합니다.

## 1. 무료 API 키 만들기
1. https://aistudio.google.com/apikey 에서 Google 계정으로 로그인합니다.
2. 이용약관을 확인하고 API 키 만들기(Create API key)를 선택합니다. 신규 사용자에게 기본 프로젝트와 키가 만들어질 수도 있습니다.
3. 새 실습용 프로젝트가 Free tier인지 확인합니다. 결제 계정 연결, Set up billing, 유료 업그레이드는 하지 않습니다. 이미 결제된 프로젝트 대신 결제 미연결 프로젝트를 사용하세요.
4. 키를 복사하되 채팅이나 HTML에 넣지 않습니다.
공식 키 안내: https://ai.google.dev/gemini-api/docs/api-key

## 2. 비공개 설정 파일 저장
프로젝트의 .env 파일을 열고 아래 두 줄의 등호 뒤에 본인 값을 입력한 다음 저장합니다.
GEMINI_API_KEY=본인의_API_키
PRACTICE_ACCESS_CODE=길고_추측하기_어려운_실습접속코드
LLM_PROVIDER=gemini와 LLM_MODEL=gemini-2.5-flash는 유지하세요.
접속코드는 홈페이지 이용자용 암호로 API 키와 별개입니다. .env는 Git에서 제외되며 웹으로 제공되지 않습니다.
저장 후 이 채팅에 “무료 프로젝트 확인했고 .env 저장했어”라고 알려 주세요. 키 값을 보내거나 키가 보이는 화면을 공유하지 마세요.

## 3. 공개 페이지에 연결
사용자의 무료 프로젝트 확인과 키 저장이 끝나면 에이전트가 키를 출력하지 않고 서버 비밀 설정으로 등록하고, 기존 공개 주소에서 가상 질문으로 실제 응답을 확인합니다. 완료 전에는 실제 AI 연결이 된 것이 아닙니다.

## 4. 로컬 실행
Node.js 22 이상을 사용합니다. 현재 노트북에는 Node.js가 있고 추가 npm 설치는 필요 없습니다.
프로젝트 폴더에서 다음 명령을 실행합니다.
node --env-file=.env server.mjs
http://127.0.0.1:8000 을 열고 접속코드와 “가상의 시민 AI 교육 참여 안내문을 5줄로 작성해 줘”를 입력합니다. 종료: Ctrl+C.
HTML 더블클릭만으로는 실제 AI 서버를 사용할 수 없습니다.

## 공급자 교체 구조
홈페이지 → /api/ask → llm-providers.mjs → Gemini → 답변
- dist/index.html: 질문, 접속코드, 답변 표시. API 키는 없습니다.
- dist/style.css: 기존 디자인과 입력칸 스타일.
- api-handler.mjs: 입력 검사·접속코드·오류 처리.
- llm-providers.mjs: 공급자별 통신. 현재 gemini만 구현되어 있습니다.
- server.mjs: 로컬 서버.
- build-worker.mjs: 동일 디자인의 호스팅용 서버 생성.
- .env.example: 비밀값 없는 설정 예시. .env: 실제 키 저장.
다른 공급자는 llmProviders에 keyName, defaultModel, generate 구현을 추가하고 LLM_PROVIDER를 바꾸면 됩니다. 화면 수정은 필요 없습니다. 새 공급자의 API 형식·무료 정책은 별도 확인해야 합니다. OpenAI 호출 및 유료 자동 대체는 없습니다.

## 무료 범위와 자료
2026-10-07 기준 gemini-2.5-flash의 무료 티어는 입력·출력이 무료입니다. 계정별 할당량은 AI Studio에서 확인하세요. 한도 초과 시 오류 안내를 표시합니다. 결제 미연결 프로젝트인지 반드시 확인하세요. 코드가 Google 계정의 결제 상태를 검증할 수는 없습니다.
무료 티어의 질문·답변은 Google 제품 개선에 사용될 수 있습니다. 공개자료·가상자료만 입력하세요. 대화 이력 저장·웹 검색 기능은 없습니다.
공식 가격: https://ai.google.dev/gemini-api/docs/pricing
질문 최대 2,000자·답변 최대 700토큰·서버 인스턴스별 분당 5회 보조 제한을 적용했습니다. 인스턴스별 제한은 전체 서비스의 엄격한 할당량 상한을 보장하지 않습니다.

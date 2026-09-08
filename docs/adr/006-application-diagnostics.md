# ADR 006: 브라우저·서버를 연결하는 앱 진단 하네스

- 상태: Accepted (2026-09-07, 감독의 전체 로그 하네스 구축 지시)

## 맥락

메시지 전송 후 화면 반영이 늦다는 보고가 있었다. 기존 운영 로그의 메시지 POST 7건은
모두 201, 서버 처리 10.64–61.24ms(중앙값 18.04ms)였다. 이 수치는 네트워크·브라우저
대기·화면 반영 시간을 포함하지 않아 원인을 판정할 수 없다. 특정 채팅만이 아니라
검색·활동·파일·인증 등 앱 전체에서 반복 사용할 관측 기반이 필요하다.

## 결정

- 기존 Fastify/Pino와 journald를 유지한다. 서버는 요청 시작/종료·오류, Prisma 호출
  횟수/합계, 소켓 연결/해제/룸 준비, 메시지 저장/emit, 첨부 저장을 구조화해 기록한다.
  60초마다 메모리·이벤트 루프 지연·소켓 수를 남긴다.
- AsyncLocalStorage로 동시 요청의 trace와 Prisma 시간을 분리한다. 요청별 UUID와
  클라이언트가 전달한 유효 UUID trace를 응답 헤더에 반환한다. Server-Timing에 app/db
  시간을 포함한다. 개별 Prisma 작업은 진단 요청·500ms 이상·5xx에서 최대 100건 기록한다.
- 브라우저 상세 기록은 사용자가 켠 탭에서만 동작한다. 최대 500건 메모리 버퍼와
  버린 개수를 유지한다. 화면 이동·클릭 종류·모든 API 호출·소켓 이벤트·오류·longtask·
  같은 origin 리소스·메시지 DOM 추가/렌더링 기회를 기록한다. 매 이벤트 React 갱신은 없다.
- URL은 정해진 경로 분류로 축약한다. 입력 본문·검색어·파일명·쿠키·토큰·이메일·SQL·
  오류 원문은 계측하지 않는다. 서버 오류는 종류/코드/자체 소스 프레임만 남긴다.
  사건 연결용 사용자/메시지/요청 ID는 존재하므로 익명 데이터라고 부르지 않는다.
- 사용자가 서버 전송을 누르면 인증 후 닫힌 Zod 스키마로 검증하고 접수번호로 journal에
  저장한다. 256KiB·500이벤트·사용자당 분당 3회 제한을 적용한다. 업로드 payload는
  `client` 아래에 넣어 서버 시간·event 필드와 구분한다. JSON 파일 저장도 지원한다.
- Python 분석기는 IAP로 journal을 읽거나 JSONL 파일을 받아 브라우저 기록과 trace로
  결합한다. 서로 다른 컴퓨터의 시계를 직접 빼지 않는다. 외부 APM·자동 보고 업로드·
  새 로그 DB·알림 시스템은 이번 구현에 포함하지 않는다.

## 한계와 검증

브라우저의 frame은 실제 픽셀 표시가 아니라 두 번의 requestAnimationFrame으로 잡은
렌더링 기회다. 백그라운드 탭에서는 지연될 수 있다. Prisma 시간은 호출 대기 전체의
합계로 순수 SQL 실행 시간이 아니며 병렬 호출 시 요청 벽시계보다 커질 수 있다.
Socket emit은 클라이언트 수신 확인이 아니다. 서버 수신 전의 OAuth 이동·터널 내부는
앱 로그로 직접 분해할 수 없다. 로그 보존 기간은 VM journald 설정에 따른다.

동시 요청 격리·민감 원문 제외·버퍼 상한·관측 해제·업로드 인증/제한을 테스트했다.
실제 웹 빌드를 사용하는 격리 브라우저 fixture에서 600ms 지연을 주입하자 HTTP 602ms,
전송→DOM 608ms로 관측됐다. 이는 계측 검증이며 운영 지연의 원인 확정이나 수정은 아니다.

## 근거

- [Fastify 요청 훅](https://fastify.dev/docs/latest/Reference/Hooks/)
- [Fastify 구조화 로깅](https://fastify.dev/docs/latest/Reference/Logging/)
- [단조 시계 performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)
- [PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver)
- [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

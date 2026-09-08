# Changelog

## 2026-09-08 — 웹 실행·진단 기반

- Fastify에서 SPA를 제공하고 loopback 바인딩·종료 처리·배포 설정 예시를 추가했다.
- 요청·소켓·업로드 진단을 연결하고 본문·자격증명을 진단 데이터에서 제외한다.
- Node 24/26 CI와 비밀정보 검사를 추가했다. 각 기능 PR의 테스트·타입 검사·빌드를 검증한다.

### 2026-09-05

- [fix] PR #7 리뷰의 실패 원문 가로 넘침 수정 — 목록용 nowrap span을 전용 블록으로
  바꿔 본문·파일명을 줄바꿈하고 높이 120px 안에서 스크롤. 실제 Composer와 CSS를
  사용한 Chromium 격리 검증에서 1,600자 실패 시 문서 폭 9,646px 회귀를 재현한 뒤,
  800/1,280px 화면의 긴 본문·4,000자 여러 줄·첨부 캡션 6경로에서 넘침 해소와
  재전송 payload·초안 보존을 확인. 웹 137개·서버 67개 테스트, 빌드·타입 검사 통과.
- [fix] #6 공유 탭에서 같은 방 검색 결과를 누르면 채팅 탭을 열도록 수정 —
  실 Chrome 재현·수정 후 확인 및 회귀 테스트 통과(Codex). 새 테스트의
  Testing Library `exact` 옵션 3곳을 제거해 빌드 실패를 해소(Claude).
- [fix] 타임라인 "이전 메시지 보기" 위치 보정이 무효였던 문제 — `await fetchNextPage()`
  뒤 rAF에서 보정했는데 react-query v5 알림이 setTimeout 배치라 커밋 전에 실행돼
  높이 차가 0이었다(실 Chrome 휠 스크롤로 관측). 페이지 수를 키로 하는
  `useLayoutEffect`에서 커밋 직후 보정하도록 변경. 회귀 테스트(rAF 선행 순서 재현) 추가
- [fix] 다른 탭에서 원본을 수정·삭제하면 그 메시지를 인용한 답장의 인용 본문·삭제
  표시가 갱신되지 않던 문제 — `replaceMessage`가 `replyTo`도 함께 갱신. 테스트 추가
- [fix] 컴포저가 전송·업로드 응답을 기다리는 동안 이어 쓴 글이 완료 시 `setText('')`로
  지워지던 문제 — 상태 소유권을 다시 설계했다(Codex 검수 2회 반영, Fix-Loop 재검토).
  제출 시 payload(본문·파일·답장 대상·멘션 id)를 스냅샷으로 떼어내고 초안(텍스트·파일
  칩·답장 칩)을 즉시 비운다. 텍스트 전송과 첨부 업로드를 하나의 `useMutation`으로 묶어
  요청 중/실패 payload는 그 mutation(`variables`·`isError`·`reset`)만 소유하고, 성공·실패
  콜백은 초안을 건드리지 않는다. 실패하면 안내 바에 원문(파일명 포함)을 보여 「재전송
  (동일 payload)/버리기」만 제공하고, 미해결 실패가 있는 동안은 새 전송을 받지 않는다
  (초안 작성은 계속 가능). 실패 시 입력창 복원 계약은 payload 보관+명시적 재전송으로
  바뀌었다. 업로드 중 파일 선택·드롭 차단은 이유(성공 시 초기화)가 사라져 제거.
  회귀 테스트 7개(지연 실패+새 초안, 미해결 실패 중 전송 차단→해소 후 전송, 버리기,
  재전송의 답장·멘션 보존, 업로드 중 초안 유지, 업로드 실패 재전송, 첨부 재전송 성공 시
  새 초안 파일 유지). 실패 경로는 단위 테스트로만 검증했다
- [fix] 열린 반응 팔레트·더보기 메뉴가 아래 메시지의 액션 바에 가려지던 z-index 문제
- [docs] Claude Chrome 플러그인 실 브라우저 검증 결과 기록 — 같은 계정 두 탭 기준
  메시지 액션 6종·첨부/공유 탭/다운로드·검색 점프·스크롤 3종 통과, 두 계정 필요 항목
  분리. `docs/handoff/2026-09-05-browser-verification-claude.md`
- [docs] ADR 004 — 컴포저 전송 payload 소유권(단일 outgoing mutation·미해결 실패 중 전송
  차단·완료 콜백의 초안 무접촉) 결정과 트레이드오프 기록
- [review] Codex 독립 검수 3회 — 1·2차에서 컴포저 재전송 결함 5건 지적, 3차 최종 PASS
  (독립 재현 5개·웹 137개·빌드·`git diff --check` 통과). 두 실계정 항목 미검증과
  브라우저 실패 주입 미실행은 그대로 남는다. 커밋·push·PR·Electron 착수는 미실행
- [docs] 수동 검증 재개 기록 — 기존 개발 DB의 compose 이름과 포트 중복 주의,
  서버·웹 기동 및 HTTP 확인 결과를 남겨 다음 검증의 시작점을 명확히 했다.

### 2026-08-30

- [fix] 웹 SPA 후속 정리(계획 ④ 최종 리뷰 파킹분) — 실패 피드백 일원화:
  반응·고정·삭제·음소거·그룹 관리 실패 시 `ErrorNotice` 안내(404 액션 실패는
  문구 없이 재조회 유지), 대화 상세·타임라인·활동 조회 실패 시 안내 +
  "다시 시도" 버튼, 검색 로딩·실패 구분
- [fix] 컴포저 정밀 수정 — 멘션 삽입 후 캐럿을 멘션 바로 뒤로 복원, `@` 단독
  입력의 Enter는 전송으로, `collectMentionIds` 접두 중복 이름 정확 매칭
  (긴 이름 우선, renderMentions와 동일 규칙), 본문 앞뒤 공백 trim 전송
- [fix] URL 끝 문장부호(`.,;:!?`)를 링크에서 제외, 고정/해제 성공 시 대화
  상세를 즉시 재조회(고정 배너 지연 제거), `attachRealtime`이 detach를
  반환해 소켓 리스너를 개별 해제(`socket.off()` 전체 해제 제거)
- [fix] 다이얼로그 접근성 — 새 채팅·그룹 설정에 `role="dialog"`·
  `aria-modal`·레이블·Escape 닫기
- [test] 픽스처 `msg`를 `test/fixtures.ts`로 분리 — cache 테스트 6개가
  import 파일마다 재실행되던 문제 해소(수집 수 == 고유 수). `maybeNotify`
  삭제 메시지·클릭 열기, `attachPresenceSignals` 신호·해제 테스트 보강
- [fix] 최종 리뷰 수정 웨이브 — 대화 상세 재조회를 고정(`/pin`) 경로로
  한정(반응·수정·삭제까지 매번 상세를 재조회하던 낭비 제거, 반응 경로
  회귀 테스트 추가), 첨부 캡션도 본문과 동일하게 trim 전송

### 2026-08-29

- [docs] v1 스펙 확정 — 골든랩 내부용, Teams '채팅' 탭 재현(1:1·그룹 채팅,
  인용 답장, 고정, 읽음 커서, 검색, 프레즌스) + 프로젝트 사이트 iframe 임베드
  모듈. 실사용 스크린샷 확인 결과 팀/채널은 거의 안 쓰여 v2로 이연.
  `docs/design/2026-08-29-deuce-v1-spec.md`
- [docs] ADR 001 — TS 풀스택 모노레포(Fastify·Socket.IO·Prisma·PostgreSQL,
  React·Vite·react-query) + Electron 데스크톱. Go 서버·Mattermost 배포 기각
- [docs] ADR 002 — 임베드는 iframe 방식만. 리뷰게이트 뷰어의 iframe +
  postMessage 검증 패턴 재사용, same-site 쿠키로 호스트 인증 코드 0줄

- [feat] `Deuce` 프로젝트 초기화 — Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 프로그램을 위한 control repo와 문서 SSOT 생성
- [chore] GOLEM 카탈로그 등록 및 골든노트 연결 활성화 — 프로젝트 위치와 상태 문서의 중앙 탐색 경로 마련

- [feat] 서버 파운데이션 모노레포 부트스트랩 — pnpm workspace(`apps/server`,
  `packages/shared`), Fastify 5 ESM(NodeNext) 서버 스켈레톤, 공통
  tsconfig 베이스
- [feat] Prisma 스키마 — v1 채팅 도메인(User·Conversation·Message·
  Attachment·Reaction·ReadState·Mention) 모델링과 초기 마이그레이션,
  로컬 개발/테스트용 Postgres 16 docker-compose
- [feat] 세션·Google OAuth 인증 — `@fastify/secure-session` 쿠키 세션,
  Google 로그인 콜백(허용 이메일 목록 기반 접근 제어), `/auth/me`·
  `/auth/logout`
- [chore] Prisma·`@prisma/client` 6.19.3 정확 고정 — npm latest는
  prerelease(8.0.0-rc)이고 Prisma 7은 기존 `datasource url = env(...)`
  Migrate 설정 방식을 깨뜨려(어댑터·`prisma.config.ts` 필요) 6.x에 머문다.
  사유는 `docs/adr/003-prisma-6-pin.md` 참고
- [fix] 최종 리뷰 수정 웨이브 — `email_verified` 미검증(Critical), 콜백
  예외 메시지 노출, oauthState 재생 공격, 보안 계약(§8) 테스트 공백,
  서버 부팅 경로의 암묵적 env 로딩 등 Critical 1건·Important 5건·
  Minor 4건 수정. 상세는 PR #2 (커밋 9c9e7d0·e40c128) 참고

- [feat] 계획 ② 채팅 REST API — `/api` 인증 가드(fastify-plugin, 허용목록
  매 요청 재검사, 14일 세션 쿠키), 전역 에러 핸들러(5xx 마스킹), 사용자 목록,
  대화방(DM 중복 방지·그룹 생성·이름·멤버·나가기·음소거·읽음 커서), 메시지
  (인용 답장·멘션·(createdAt,id) 키셋 페이지네이션·수정·소프트 삭제·반응·고정),
  대화방 상세(최신 핀), pg_trgm 한국어 부분일치 검색(ILIKE 이스케이프,
  멤버십 스코프), 활동 피드. 실 DB 테스트 46개
- [fix] 계획 ② 최종 리뷰 수정 웨이브 — 세션 쿠키 maxAge 14일(계획 결함),
  DM 나가기 차단(대화 분기 방지), 활동 피드 멤버십 스코프, 신규 멤버 안 읽음
  기준선 joinedAt, 대화방 목록 정렬 회귀 테스트
- [docs] 스펙 §8 보강 — 골든랩 메일은 네이버웍스라 구성원은 개인 구글
  계정으로 로그인, OAuth 동의 화면은 External + 테스트 사용자 방식 확정

- [feat] 계획 ③ 실시간·프레즌스·파일 — Socket.IO(세션 쿠키 인증, user/convo
  룸, 가드된 접속 핸들러), 이벤트 브로드캐스트(message.new/updated/deleted,
  reaction.changed, read.advanced, conversation.created/updated/removed +
  룸 동기화), 인메모리 프레즌스(online/away/offline + GET /api/presence),
  서버 경유 파일 첨부(FileStorage 드라이버·경로 탈출 가드·고아 파일 정리·
  multipart 업로드→메시지·스트림 다운로드·공유 탭). 실 DB·실 소켓 테스트 64개
- [feat] 계획 ② 이월분 정리 — 그룹 타인 제거 엔드포인트, 반응·핀·읽음
  라우트의 DTO 반환 전환, 삭제 메시지 가드, 읽음 커서·안읽음 카운트의
  (createdAt,id) 페이지네이션 정합
- [fix] 계획 ③ 최종 리뷰 수정 웨이브 — 256KB+ 업로드 캡션 소실(멀티파트
  필드 파싱 순서), Socket.IO 이벤트 타입 계약(`ServerToClientEvents` 등
  shared 고정), 확장자 세정(`photo.jpg (1)` 500 방지), 삭제 메시지 첨부
  메타 마스킹, 핸드셰이크 실패 로깅, 다운로드 content-length·nosniff
- [docs] 스펙 §3·§6 문구 — 파일 첨부를 GCS 서명 URL 직행에서 서버 경유 +
  스토리지 드라이버(개발 로컬 디스크, 운영 GCS는 계획 ⑥)로 변경 — 다운로드
  마다 멤버십 검사, 개발·운영 단일 흐름

- [feat] 계획 ④ 웹 SPA — React 19 + Vite + react-query SPA(`apps/web`).
  인증 게이트(`/auth/me` 401 → 로그인 화면)·앱 셸 라우팅, 대화 목록(안 읽음
  필터·배지·미리보기)·새 채팅(DM 중복 방지), 메시지 타임라인(커서
  페이지네이션·읽음 커서 전진)·컴포저(인용 답장·`@` 멘션 자동완성·IME 조합
  가드), 메시지 액션(수정·소프트 삭제·반응 6종·고정 배너), 파일 첨부 업로드·
  다운로드 카드·공유 탭, 그룹 관리(이름·멤버·나가기)·음소거, 타입 계약
  `@deuce/shared` 기반 Socket.IO 와이어링(캐시 직접 갱신 + 재접속 시 전체
  invalidate)·프레즌스 점, 검색·활동 피드·메시지 점프·웹 알림. 모든 응답은
  zod `.parse()` 통과, 상태 동기화는 react-query 단일 경로. 테스트 80개(고유,
  수집 기준 122 — 픽스처를 `cache.test.ts`에서 가져오는 파일마다 그 6개가 함께
  재실행된다)
- [fix] 점프 완료 후 `?m=` 정리 — 스크롤을 실행했거나 더 못 찾아 멈출 때
  `useJumpToMessage`가 완료를 알리고 `ChatView`가 파라미터를 지운다. 안 지우면
  같은 고정 메시지를 다시 눌러도 URL이 그대로라 반응이 없고, 채팅↔공유 탭을
  오갈 때 남은 파라미터가 재점프·재하이라이트를 일으켰다
- [fix] 방 이동마다 소켓이 재연결되던 회귀 방지 — 알림 클릭 이동을 붙이며
  `useNavigate()`를 소켓 effect 의존성에 넣었더니, react-router 7의 `navigate`
  가 `locationPathname`에 묶여 매 경로 변경마다 새 함수가 되어 소켓이
  끊겼다 붙었다(재구독 + 전체 invalidate). ref로 최신 `navigate`만 읽도록
  바꾸고 회귀 테스트(`test/socket.test.tsx`)로 고정
- [feat] 계획 ④ 이월 4건 해소 — 포커스 복귀 시 `presence:active` 재송신(자리
  비움 자가 치유), 멤버 재추가 시 `conversation.created` 중복 수신(invalidate
  멱등으로 무해함을 테스트로 고정), 대화방 403 / 메시지 액션 404 비대칭 처리,
  DM "시작" 버튼 중복 클릭 방지
- [feat] 첨부 캡션 400 계약 — `POST /api/conversations/:id/attachments`의
  캡션이 4000자를 넘으면 무고지 절단 대신 400 `invalid body` + 저장 파일
  정리. PR #4 듀얼 리뷰 이월 사항
- [decision] 멘션은 이름 매칭 방식 — 본문은 평문이라 클라이언트가 전송 직전에
  `@{멤버 이름}` 포함 여부로 사용자 ID를 뽑아 `mentions`에 실어 보내고(서버는
  ID가 멤버인지만 검증), 표시도 같은 멤버 이름 목록으로 강조한다. 본문에 ID
  토큰을 심는 방식은 평문 textarea 입력기와 맞지 않아 v1에서 보류. 이름이
  겹치거나 이름 문자열을 손으로 지우면 어긋날 수 있음을 감수한다
- [decision] 타인 읽음 표시(내 메시지를 누가 읽었는지)는 v1 제외 — 멤버별 읽음
  커서를 돌려주는 REST 스냅샷이 없어 소켓 `read.advanced`만으로는 초기 상태를
  복원할 수 없다. v2에서 `GET /api/conversations/:id`에 멤버별 커서 포함 검토
- [decision] 메시지 점프는 최근 20페이지(약 1,000개)까지만 자동 탐색 — 검색·
  활동에서 온 오래된 메시지는 무한히 거슬러 올라가지 않고 조용히 중단한다.
  전체 탐색은 서버의 "메시지 주변 컨텍스트" 엔드포인트가 필요해 v2로 이연
- [decision] 첨부 캡션 전송은 답장(`replyToId`)·멘션(`mentions`)을 지원하지
  않는다 — 서버 첨부 계약의 공백이다. 확장 여부는 계획 ⑤/⑥에서 결정

# Deuce v1 스펙 — 골든랩 내부 채팅

- 상태: 감독 승인 (2026-08-29)
- 관련 결정: [ADR 001](../adr/001-ts-fullstack-electron.md), [ADR 002](../adr/002-iframe-embed-module.md)

## 1. 목적과 배경

Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 프로그램을 골든랩
내부용으로 만든다. 실사용 조사 결과 구성원의 사용 패턴은 팀/채널이 아니라
**Teams '채팅' 탭**(1:1 + 이름 있는 그룹 채팅)에 집중되어 있으므로, v1은
채팅 탭의 재현에 집중한다. 또한 리뷰게이트(EtaxbookGateLab)가 채널 채팅을
자체 구현했던 전례처럼 프로젝트마다 채팅을 다시 만드는 중복을 없애기 위해,
Deuce를 **중앙 채팅 서비스 + 프로젝트 사이트 임베드 모듈**로 설계한다.

우선순위는 명확하다: **기본 제품은 독립 채팅 앱**(데스크톱·웹)이며, 임베드
모듈은 부가 산출물이다. 구현도 채팅 앱을 먼저 완성한 뒤 임베드를 v1 후반
마일스톤으로 붙인다.

## 2. 사용자와 규모 가정

- 골든랩 내부 구성원·협업자 전용. 단일 조직, 멀티테넌트 없음.
- 동시 사용자 수십 명 이하. 서버 프로세스 1개 + PostgreSQL 1개로 충분한
  규모이며, Redis·메시지큐·수평 확장은 설계에 포함하지 않는다.

## 3. v1 범위

### 포함

- **대화방**: 1:1 채팅, 이름 있는 그룹 채팅(멤버 추가/제거, 이름 변경)
- **메시지**: 플레인 텍스트 + 줄바꿈, 링크 자동 인식. 서식 편집기 없음
- **인용 답장**: Teams 채팅과 동일한 평면 인용(`reply_to_id`). 스레드 아님
- **수정·삭제**: 작성자 본인만. 삭제는 소프트 삭제("삭제된 메시지" 표시)
- **이모지 반응**, **읽음 표시**(사용자별 읽음 커서 → 안 읽음 배지 겸용)
- **고정 메시지**: 대화방 상단 배너에 최신 핀 표시
- **파일 첨부**: 서버 경유 업로드/다운로드 + 스토리지 드라이버(개발: 로컬
  디스크, 운영: GCS — 계획 ⑥). 다운로드마다 멤버십 검사. 대화방 '공유'
  탭에서 모아보기 (2026-08-29 변경: 서명 URL 직행 대신 서버 경유 — 권한
  검사 일원화, 개발·운영 단일 흐름)
- **멘션·알림**: @이름 멘션, 새 메시지 데스크톱/웹 알림, 대화방별 음소거
- **검색**: 메시지 본문 키워드 검색 (`pg_trgm` 부분일치 — 한국어 대응)
- **프레즌스**: 접속 기반 자동 상태(온라인/자리 비움/오프라인) 표시
- **활동 피드**: 나를 멘션·반응한 항목 모아보기 (경량)
- **임베드 모듈**: 프로젝트 사이트에 iframe으로 붙이는 단일 대화방 패널 (§7)

### 제외 (v2 이후 후보)

- 팀 → 채널 계층과 게시물+답글 UI (Teams '팀' 탭)
- 화상회의·통화, 모바일 앱
- 대화방 '노트'·'요약' 탭, 서식 있는 텍스트 편집기
- 수동 상태 설정(다른 용무 등), 오프라인 작성 큐
- 리뷰게이트 기존 채널 기능의 Deuce 대체 (해당 프로젝트에서 별도 결정)
- 리뷰게이트 계정과의 SSO 통합

## 4. UI 구조 — Teams 관례 준수

내부 구성원이 Teams 인터페이스에 익숙하므로 Teams 한국어판 관례를 따른다.

- **왼쪽 세로 앱 바**: 활동 / 채팅 (v2에서 '팀' 추가 여지)
- **목록 패널**: 대화방 목록 + 필터 칩(읽지 않음/채팅), 안 읽음 배지
- **대화 패널**: 선형 말풍선 타임라인, 상단에 고정 메시지 배너,
  상단 탭 **채팅 | 공유**(파일 모아보기)
- 용어는 Teams 한국어판 기준: 채팅, 활동, 고정, 답장

## 5. 아키텍처

pnpm 모노레포 하나에 산출물 3개:

```
deuce/
├── apps/server      # Node.js + Fastify(REST) + Socket.IO(실시간) + Prisma
├── apps/web         # React + Vite SPA — 웹 접속·임베드·Electron 공용
├── apps/desktop     # Electron 셸 (Windows·Mac 패키징)
└── packages/shared  # 메시지·이벤트 타입, zod 스키마 (서버·클라 공유)
```

- **서버**: Node.js, Fastify, Socket.IO, Prisma, PostgreSQL 16
- **클라이언트**: React, Vite, react-query(서버 상태), Socket.IO 클라이언트.
  실시간 이벤트 수신 시 react-query 캐시를 append/invalidate — 상태 동기화
  프리미티브를 손코딩하지 않는다
- **데스크톱**: Electron + electron-builder. 자동 업데이트는 electron-updater,
  업데이트 피드는 GCS 버킷 게시. Mac은 보유한 Developer ID 인증서로
  서명·공증(`~/.claude/reference/apple-developer.md`), Windows는 내부용이므로
  코드서명 생략(SmartScreen 경고 1회 감수)

### 데이터 흐름

- **REST**: 히스토리 조회(페이지네이션), 검색, 파일 업로드, 대화방 관리
- **Socket.IO**: 대화방 = 룸. 이벤트: `message.new` / `message.updated` /
  `message.deleted` / `reaction.changed` / `read.advanced` /
  `presence.changed`. 재접속·룸 관리는 Socket.IO 내장 기능 사용
- 재연결 시 최신 메시지 재동기화(react-query invalidate). 전송 실패
  메시지는 재시도 UI만 제공

## 6. 데이터 모델 (핵심 엔티티)

| 엔티티 | 핵심 필드 | 비고 |
|---|---|---|
| User | email, name, avatar | Google 프로필 연동 |
| Conversation | `type: dm \| group`, title, embed_key | type에 `channel` 예약 — v2 확장 시 스키마 불변 |
| ConversationMember | conversation_id, user_id, muted_at | |
| Message | body, `reply_to_id`(self FK), edited_at, deleted_at, pinned_at | 평면 인용, 소프트 삭제 |
| Attachment | message_id, 스토리지 오브젝트 키, 파일명, 크기 | |
| Reaction | message_id, user_id, emoji | |
| ReadState | (user_id, conversation_id) → last_read_message_id | 읽음 커서 |
| Mention | message_id, mentioned_user_id | 활동 피드·알림 원천 |

검색은 Message.body에 `pg_trgm` GIN 인덱스.

## 7. 임베드 모듈

프로젝트마다 만드는 프로젝트 사이트에 Deuce 채팅을 무개발로 붙인다.

- **방식**: iframe 임베드만. 호스트 프레임워크 불문. React 컴포넌트
  패키지는 만들지 않는다
- **URL 계약**: `https://deuce.goldenlabs.dev/embed/{embed_key}` — 크롬 없는
  단일 대화방 패널. 그룹 대화방 설정에서 임베드 키를 발급/회수한다.
  프로젝트 사이트 하나 = 대화방 하나 매핑
- **삽입**: 문서화된 iframe 스니펫 또는 `embed.js` 로더 한 줄
- **인증**: 내부 사이트가 전부 `*.goldenlabs.dev` 아래이므로 iframe은
  same-site — Deuce 세션 쿠키가 그대로 동작한다. 비로그인 시 iframe 안에서
  Google 로그인 팝업. 호스트 사이트 인증 코드 0줄
- **postMessage 브리지(최소)**: 안 읽음 개수 통지, 패널 높이 조절.
  리뷰게이트 뷰어 브리지(`useViewerBridge` 패턴)와 같은 요령

## 8. 인증·보안

- **Google OAuth 로그인 + 서버측 허용 이메일 목록**. 비밀번호 저장 없음
- 골든랩 메일(`@goldenlabs.dev`)은 네이버웍스 소속이라 구글 로그인에 쓸 수
  없다 — 구성원은 **개인 구글 계정(Gmail)** 으로 로그인하고, 허용목록에도
  그 주소를 등록한다 (2026-08-29 확정)
- OAuth 동의 화면은 GCP 조직이 없으므로(개인 계정 프로젝트) **External +
  테스트 사용자 등록** 방식으로 구성한다
- 세션: httpOnly 쿠키(`SameSite=Lax`, Secure). 웹·Electron·임베드 동일 동작
- 임베드 키는 대화방 접근 토큰이 아니라 **표시할 방 지정자**일 뿐이며,
  메시지 접근 권한은 항상 로그인 세션 + 대화방 멤버십으로 검사한다

## 9. 배포·운영

- GCP 소형 VM 1대 + Docker Compose(server, PostgreSQL, Caddy TLS)
- 도메인: `deuce.goldenlabs.dev`
- 파일·업데이트 피드: GCS 버킷
- 백업: PostgreSQL 일일 덤프 → GCS
- 인프라 생성·변경은 감독 승인 후 실행한다 (글로벌 Execution Boundaries)

## 10. 테스트 전략

- 서버: API + 소켓 통합 테스트(로컬 PostgreSQL 대상), TDD로 진행
- 클라이언트: 핵심 로직 단위 테스트(Vitest)
- E2E: Playwright 스모크 1개 — 로그인 → 대화방 생성 → 메시지 →
  인용 답장 → 검색 → 임베드 페이지 로드

## 11. 검증 기준 (v1 완료 기준)

- [ ] Windows·Mac Electron 앱과 브라우저에서 같은 계정으로 로그인해 같은
      대화 내용을 실시간으로 주고받을 수 있다 (수신 지연 체감 1초 이내)
- [ ] 그룹 대화방에서 인용 답장·수정·삭제·이모지 반응·고정이 동작하고,
      다른 접속자 화면에 새로고침 없이 반영된다
- [ ] 안 읽음 배지가 읽음 커서 기준으로 정확히 표시되고, 대화방 진입 시
      해소된다
- [ ] 파일을 첨부해 보내고 '공유' 탭에서 다시 내려받을 수 있다
- [ ] 한국어 키워드로 과거 메시지를 검색해 해당 대화방·메시지로 이동할 수
      있다
- [ ] 허용 목록에 없는 Google 계정은 로그인이 거부된다
- [ ] 외부 프로젝트 사이트(테스트 페이지)에 iframe 스니펫만 넣어 임베드
      대화방이 로드되고, 로그인 세션이 재사용된다

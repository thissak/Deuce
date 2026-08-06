---
lifecycle: active
---

# Deuce 진행 상태

## Bootstrap

- [x] 내부 협업 도구의 이름과 목적 확정
- [x] 독립 워크스페이스와 `main` Git 저장소 생성
- [x] Claude 문서 SSOT와 Codex 중개 구조 생성
- [x] GOLEM 카탈로그 등록
- [x] 비공개 GitHub 저장소 `thissak/Deuce` 생성 및 origin 연결
- [x] 이미지·영상·일반 파일의 원본 저장소를 비공개 Cloudflare R2로 확정 ([ADR 001](adr/001-r2-object-storage.md))
- [x] PC·Android·iPhone용 설치형 협업 앱을 클라이언트 범위로 확정
- [x] R2 인프라 연결 계약 문서화 ([R2 연결](infrastructure/r2-connection.md))
- [x] Flutter 공통 클라이언트와 플랫폼 작업 분리 확정 ([ADR 002](adr/002-flutter-client-platform-split.md))
- [x] Mac Pro iOS 작업 handoff 작성 ([iOS handoff](handoff/ios-client-macpro-handoff.md))
- [ ] 초기 사용자 흐름과 MVP 범위 확정
- [x] 첫 슬라이스 기술 스택과 Windows 실행 환경 확정
- [x] 성숙한 오픈소스 prior art를 바탕으로 협업 코어 설계 정리 ([설계 문서](specs/collaboration-core-design.md))
- [ ] 사람과 에이전트가 함께 사용하는 첫 작업방 구현

## 첫 메시지 버티컬 슬라이스

- [x] Windows Flutter 클라이언트 구현과 릴리스 빌드
- [x] TypeScript 서버와 PostgreSQL 메시지 저장
- [x] Flutter 클라이언트 2개의 실시간 메시지 자동 관통 검증
- [x] 연결 종료와 서버 재시작 후 누락 메시지 자동 복구 검증
- [x] 두 Windows 네이티브 앱 창의 수동 인수 확인 ([실행 방법](development/local-first-slice.md))
- [ ] 같은 URL에서 다른 서버 DB로 전환할 때 기존 메시지와 복구 순번 초기화
- [ ] Android 클라이언트 연결 (Windows 슬라이스 이후)
- [ ] iPhone 클라이언트 연결 (Mac Pro handoff 작업)

기존 메시지 저장·복구 경로는 실제 Deuce 사용자 UUID와 표시 이름을 사용하도록 인증
슬라이스에 연결됐다. 채널은 아직 `general` 하나이며 서버는 계속 `127.0.0.1`에만
바인딩한다.

## 실제 인증과 `general` 권한

- [x] Keycloak OIDC와 Deuce 권한 경계 확정 ([ADR 004](adr/004-keycloak-oidc-authentication.md))
- [x] HTTP·Socket.IO·세션 폐기 공통 계약 확정 ([인증 계약 v1](contracts/auth-v1.md))
- [x] Windows 시스템 브라우저 Authorization Code + PKCE 로그인 구현
- [x] OIDC access token 검증과 Deuce 사용자 연결
- [x] `general` 채널 멤버십 기반 조회·전송·구독 권한
- [x] 로그아웃·back-channel logout·사용자 비활성화의 기존 Socket 즉시 종료
- [x] token 비노출과 인증 실패 경로 자동 검증
- [x] 실제 Keycloak realm에서 Windows 로그인·token 갱신·로그아웃 관통 검증

Keycloak 26.7 loopback realm에서 Windows 시스템 브라우저 로그인, 60초 access token
만료 뒤 갱신·Socket 재연결, 메시지 저장과 로컬·Keycloak 로그아웃을 관통 검증했다.
공개 DNS, HTTPS 진입점과 외부 바인딩은 별도 승인된 인프라 작업으로 진행하며 그전까지
기존 loopback·SSH 터널 경계를 유지한다.

## 맥미니 비공개 스테이징

- [x] 실행용 JavaScript 빌드와 macOS LaunchAgent 설치 골격 작성
- [x] loopback 전용 설치·SSH 터널 검증 절차 확정 ([ADR 003](adr/003-mac-mini-private-staging.md), [설치 방법](infrastructure/mac-mini-private-staging.md))
- [x] 맥미니 SSH 로그인 계정과 공개키 인증 확인
- [x] 맥미니 Node.js 24·PostgreSQL 17 환경 준비와 DB 마이그레이션
- [x] LaunchAgent 실행, 비정상 종료 자동 복구와 메시지 순번 보존 확인
- [x] 인증 버전의 Windows 로그인·token 갱신·로그아웃을 SSH 양방향 터널로 맥미니 경유 검증
- [ ] 인증 버전을 기본 LaunchAgent로 승격
- [ ] 맥미니 로그인·재부팅 후 LaunchAgent 자동 시작과 메시지 보존 확인

인증 커밋 `8dde4f2`는 분리된 릴리스와 임시 `127.0.0.1:33210` 프로세스로 검증했고,
인증 마이그레이션과 Alice·Bob 연결은 맥미니 DB에 적용했다. 테스트 프로세스와 터널은
종료했으며 기본 `127.0.0.1:3210` LaunchAgent는 여전히 인증 전 커밋 `05e8c07`을
실행한다. 공개 DNS, 포트포워딩과 외부 바인딩은 사용하지 않는다.

## 제품 목표

- 사용자 10명 이하의 골든랩 내부 도구로 바로 사용한다.
- Teams와 Slack을 참고한 PC·Android·iPhone용 설치형 협업 앱으로 제공한다.
- 대화와 자료 공유가 쉽고, 사람과 에이전트가 같은 데이터를 보며 작업한다.

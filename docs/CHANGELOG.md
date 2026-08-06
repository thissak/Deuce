# Changelog

### 2026-08-07

- [test] Keycloak 26.7 loopback realm에서 Windows 로그인·60초 token 갱신·Socket 재연결·메시지 저장·로그아웃 관통 검증 — Deuce 세션 폐기와 Keycloak 활성 세션 0건 확인
- [chore] 저장소 밖 DPAPI 비밀번호를 쓰는 로컬 Keycloak realm과 시작·종료 스크립트 추가 — 공개 DNS나 외부 바인딩 없이 실제 OIDC 개발 반복 가능
- [docs] 실제 Keycloak 로컬 실행 절차와 검증 결과 반영 — 인증 슬라이스의 미검증 상태를 완료로 전환하고 공개 인프라 경계 유지
- [test] OIDC 실패 경계와 세션 종료를 실제 PostgreSQL·Socket.IO로 검증하고 Flutter 분석·테스트·Windows 릴리스 빌드 통과 — 잘못된 issuer/audience·만료·비멤버·폐기 세션과 token 전달 회귀 차단
- [feat] Windows Flutter 앱에 시스템 브라우저 Authorization Code + PKCE 로그인과 보안 token 저장 연결 — 개발 사용자 선택기를 제거하고 HTTP·Socket.IO가 갱신 가능한 동일 Bearer token 사용
- [feat] 서버 OIDC 인증과 Deuce 권한 모델 구현 — 고정 issuer·audience·JWKS 검증, 내부 사용자·`general` 멤버십, 로컬/back-channel logout과 사용자 비활성화 시 기존 Socket 즉시 종료
- [chore] Windows 보안 token 저장 플러그인 빌드를 위해 Visual C++ ATL 구성요소 추가 — MSVC 14.44 도구셋으로 릴리스 실행 파일 생성 확인
- [docs] 인증된 로컬 실행, Deuce 사용자 연결, 맥미니 미배포 경계와 메시지 계약 갱신 — 실제 Keycloak 관통 전 loopback 유지 조건 명시
- [docs] Keycloak OIDC와 Deuce 권한 경계를 ADR 및 인증 계약으로 확정 — 네이티브 PKCE 로그인, HTTP·Socket.IO 공통 검증과 즉시 세션 폐기의 구현 기준 마련

### 2026-08-06

- [test] 맥미니 Node 프로세스 `SIGKILL` 후 LaunchAgent 새 PID 복구, 메시지 순번 1→2 보존과 Windows SSH 터널 관통 확인 — 기존 Caddy·Cloudflare·Gitea·runner 회귀 없이 비공개 스테이징 검증
- [chore] 맥미니에 keg-only Node 24와 PostgreSQL 17, SCRAM TCP 인증, `deuce_app` DB와 loopback LaunchAgent 설치 — 기존 Node 25와 공용 서비스를 유지한 채 Deuce 서버 상시 실행
- [fix] macOS LaunchAgent 배열 인자 치환을 `PlistBuddy`로 변경하고 미치환 자리표시자 검증 추가 — `plutil`의 배열 삽입 동작으로 서버가 재시작 루프에 빠지는 문제 차단
- [docs] 맥미니의 SSH·Tailscale·Cloudflare·공용 서비스와 Deuce 환경을 글로벌 인프라 인벤토리에 통합 — 기존 서비스 충돌 없이 설치 자동화를 이어갈 공통 근거 확정
- [chore] 맥미니 비공개 스테이징용 실행 빌드와 LaunchAgent 설치 골격 추가 — 인증 전 loopback 바인딩을 강제하면서 macOS 자동 재시작을 검증할 기반 마련
- [docs] 맥미니 PostgreSQL 준비, 저장소 밖 환경 파일, SSH 터널과 공개 전 안전 경계 문서화 — 실제 인증 전 외부 노출을 차단한 채 Windows 앱 관통 검증이 가능하도록 정리
- [docs] Mattermost·Zulip·Matrix·FluffyChat·Rocket.Chat의 검증된 패턴을 협업 코어 설계로 정리 — 현재 Socket.IO·PostgreSQL·R2 방향을 유지하고 미결정 기술과 후속 검증 항목을 분리
- [test] 두 Windows 네이티브 앱 창의 수동 송수신 확인 — Alice와 Bob이 같은 채널에서 실시간 메시지를 주고받는 첫 슬라이스 인수 완료
- [feat] 메시지 작성 단축키 추가 — Enter로 전송하고 Shift+Enter로 줄바꿈하는 데스크톱 채팅 입력 동작 제공
- [fix] 재접속 복구 기준을 마지막 성공 순번으로 유지 — 누락 조회 실패 뒤 들어온 실시간 이벤트가 중간 메시지를 영구히 건너뛰지 않도록 수정
- [fix] 자동 관통 테스트 후 PowerShell 환경 복원 — 후속 개발 서버가 테스트 DB를 잘못 사용하지 않도록 호출 전 값을 보존
- [test] PostgreSQL·Socket.IO 서버 통합 테스트와 Flutter 두 클라이언트 관통 테스트 추가 — 저장 후 방송, 중복 방지, 누락 복구와 서버 재시작 보존 검증
- [feat] Windows 첫 메시지 버티컬 슬라이스 구현 — Flutter 채널 UI, TypeScript 실시간 서버, PostgreSQL 영구 저장과 재접속 복구 연결
- [docs] 로컬 실행·자동 검증·현재 보안 경계 문서화 — 인증 전 loopback 전용 원칙과 두 Windows 창 수동 확인 절차 명시
- [docs] 메시지 계약 v1 고정 — HTTP 누락 조회, Socket.IO 전송·방송·중복 방지 규칙을 플랫폼 handoff의 공통 기준으로 명시
- [docs] 첫 버티컬 슬라이스를 Windows 우선으로 분리하고 Mac Pro iOS handoff 작성 — Xcode 작업을 별도 환경에 격리하면서 Flutter 공통 계약을 유지
- [docs] PC·Android·iPhone용 설치형 협업 앱과 R2 연결 계약을 문서화 — Cloudflare 범위를 원본 파일 저장소로 한정하고 웹사이트 인프라 가정을 제거
- [docs] 이미지·영상·일반 파일의 원본 저장소를 비공개 Cloudflare R2로 확정 — 맥미니의 제한된 용량과 대용량 파일 중계 부담을 분리
- [feat] Deuce 프로젝트 부트스트랩 — 사람과 에이전트가 같은 대화·자료·작업 맥락을 공유하는 골든랩 내부 협업 도구로 정의
- [chore] 독립 워크스페이스와 문서 SSOT를 생성하고 GOLEM 카탈로그에 등록
- [chore] 비공개 GitHub 저장소 `thissak/Deuce`를 생성하고 로컬 origin으로 연결 — 내부 프로젝트의 원격 이력 기반 마련

# Deuce

10명 이하의 팀이 프로젝트 대화와 자료를 공유하기 위한 설치형 협업 앱이다. Teams와
Slack의 익숙한 채널 UI를 참고하며 Windows·Android·iPhone을 대상으로 한다.

현재 저장소에는 Windows 우선의 첫 메시지 버티컬 슬라이스가 구현되어 있다.

- Flutter 공통 클라이언트와 Windows Runner
- TypeScript, Fastify, Socket.IO 메시지 서버
- PostgreSQL 영구 저장과 재접속 복구
- Keycloak OIDC Authorization Code + PKCE 로그인과 Windows 보안 토큰 저장
- OIDC 사용자 연결, 세션 폐기와 `general` 멤버십 권한

맥미니에는 Keycloak 26.7과 인증된 Deuce 서버가 LaunchAgent로 실행된다. 두 서비스는
`127.0.0.1`에만 바인딩하고 기존 Tailscale Funnel과 Caddy가 승인된 로그인·API·Socket.IO
경로를 공개 HTTPS로 전달한다. Windows 앱의 실제 로그인과 인증된 메시지 조회를
확인했다.

로컬 실행과 검증 방법은 [첫 메시지 로컬 실행](docs/development/local-first-slice.md)을
따른다. 맥미니 운영은 [상시 서비스 runbook](docs/infrastructure/mac-mini-production.md),
다른 Windows PC 배포는 [포터블 패키지](docs/distribution/windows-portable.md)를 따른다.
제품 범위와 현재 상태는 [진행 상태](docs/PROGRESS.md)가 기준이다.

# Deuce

10명 이하의 팀이 프로젝트 대화와 자료를 공유하기 위한 설치형 협업 앱이다. Teams와
Slack의 익숙한 채널 UI를 참고하며 Windows·Android·iPhone을 대상으로 한다.

현재 저장소에는 Windows 우선의 첫 메시지 버티컬 슬라이스가 구현되어 있다.

- Flutter 공통 클라이언트와 Windows Runner
- TypeScript, Fastify, Socket.IO 메시지 서버
- PostgreSQL 영구 저장과 재접속 복구
- Keycloak OIDC Authorization Code + PKCE 로그인과 Windows 보안 토큰 저장
- OIDC 사용자 연결, 세션 폐기와 `general` 멤버십 권한

인증 코드는 로컬 서명 토큰과 PostgreSQL 통합 테스트를 통과했지만 실제 Keycloak realm은
아직 설치하지 않았다. 서버 기본 바인딩은 `127.0.0.1`이며 실제 Keycloak 관통과 공개
HTTPS 경계를 검증하기 전에는 공개 인터넷에 노출하지 않는다.

로컬 실행과 검증 방법은 [첫 메시지 로컬 실행](docs/development/local-first-slice.md)을
따른다. 제품 범위와 현재 상태는 [진행 상태](docs/PROGRESS.md)가 기준이다.

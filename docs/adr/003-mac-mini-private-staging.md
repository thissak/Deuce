# ADR 003: 맥미니 비공개 스테이징을 LaunchAgent와 SSH 터널로 운영

## Status

Accepted

## Context

첫 메시지 버티컬 슬라이스는 Windows loopback 환경에서 검증됐지만, 최종 서버는
맥미니에서 실행해야 한다. 실제 사용자 인증과 공개 HTTPS 경로는 아직 구현되지 않아
현재 서버를 LAN이나 공개 인터넷에 바인딩하면 개발 fixture를 누구나 가장할 수 있다.

macOS 실행, PostgreSQL 보존과 프로세스 자동 복구는 인증 구현과 별개로 먼저 검증할
가치가 있다. Windows 클라이언트도 외부 포트를 열지 않고 맥미니 서버에 연결할 안전한
개발 경로가 필요하다.

## Decision

- 인증 전 맥미니 배포는 비공개 스테이징으로만 사용한다.
- Deuce HTTP와 Socket.IO 서버는 `127.0.0.1`에만 바인딩하며 실행 래퍼에서도 이를
  강제한다.
- Windows 클라이언트는 기존 Tailscale 연결 위의 SSH 로컬 포트 포워딩으로만 서버에
  접근한다.
- 서버는 실행용 JavaScript를 빌드하고 macOS 사용자 LaunchAgent가 절대 Node 경로로
  실행한다.
- 데이터는 맥미니 PostgreSQL에 저장하고 데이터베이스 URL은 저장소 밖의 권한 제한된
  환경 파일에 둔다.
- LaunchAgent는 로그인 세션에서 자동 시작하고 비정상 종료 시 재시작한다.
- LaunchDaemon, 공개 DNS, 포트포워딩, Cloudflare Tunnel과 외부 바인딩은 인증과 운영
  비밀 관리가 검증될 때까지 도입하지 않는다.

## Consequences

- 공개 포트를 열지 않고 맥미니의 실제 런타임과 Windows 앱 관통 경로를 검증할 수 있다.
- 인증 구현 전 개발 fixture가 Tailscale 네트워크 전체에 노출되는 일을 막는다.
- 맥미니 로그인 세션이 없으면 LaunchAgent가 실행되지 않으므로 아직 완전한 무인 부팅
  운영 구성이 아니다.
- SSH 터널이 끊기면 Windows 클라이언트 연결도 끊기지만 기존 누락 메시지 복구 경로를
  함께 검증할 수 있다.
- 공개 운영으로 전환할 때 인증, HTTPS 진입점, 백업과 LaunchDaemon 여부를 다시
  결정해야 한다.

구체적인 설치와 검증 명령은
[맥미니 비공개 스테이징 서버](../infrastructure/mac-mini-private-staging.md)에 둔다.

# ADR 005: Tailscale Funnel과 Caddy로 맥미니 인증 경로 공개

## Status

Accepted

## Context

인증된 Deuce 서버와 Keycloak은 맥미니에서 상시 실행해야 하고 Tailscale이 없는 다른
Windows PC에서도 접근할 수 있어야 한다. 맥미니에는 이미 공개 HTTPS Funnel이 Caddy
`:8080`으로 연결되어 있다. Cloudflare는 Deuce에서 비공개 R2 원본 저장소 역할로
한정했으며 기존 Cloudflare Tunnel은 여러 프로젝트가 공유하므로 변경 위험이 크다.

Keycloak과 Deuce를 외부 주소에 직접 바인딩하면 TLS 종료, 프록시 신뢰 경계와 관리
endpoint 노출을 각 서비스가 따로 소유하게 된다. 대용량 파일은 이후 R2와 직접
전송하므로 이 진입점은 로그인, 메시지와 파일 권한 요청에 집중할 수 있다.

## Decision

- 기존 `https://ai-macmini.tail098c36.ts.net` Funnel의 Caddy `:8080` 원본을 재사용한다.
- Keycloak은 `127.0.0.1:8180`, 관리 health는 `127.0.0.1:9000`, Deuce API와 Socket.IO는
  `127.0.0.1:3210`에만 바인딩한다.
- Caddy는 `/keycloak/*`, Deuce HTTP endpoint와 `/socket.io/*`만 각 loopback 서비스로
  프록시한다.
- `/keycloak/admin/*`와 `/keycloak/realms/master/*`는 공개 Caddy에서 404로 차단한다.
  Keycloak 관리는 SSH 후 loopback CLI로 수행한다.
- Keycloak은 별도 PostgreSQL DB와 역할을 사용하고 저장소 밖 권한 `600` 비밀 파일에서
  자격증명을 읽는다.
- Keycloak과 Deuce는 macOS GUI LaunchAgent로 실행하고 실패 시 자동 재시작한다.
- Cloudflare Tunnel과 DNS는 변경하지 않으며 Cloudflare의 Deuce 범위는 R2로 유지한다.

## Consequences

- 다른 Windows PC는 Tailscale이나 서버 설치 없이 공개 HTTPS로 로그인하고 메시지를
  사용할 수 있다.
- 서비스가 loopback에 머물러 직접 포트 노출과 프록시 우회 경로가 생기지 않는다.
- 하나의 공개 호스트와 Caddy를 기존 정적 사이트와 공유하므로 Caddy 변경 전 검증과
  롤백 백업이 필요하다.
- Tailscale Funnel의 가용성·대역폭 제한과 beta 정책에 의존한다. 대용량 파일은 이
  경로가 아니라 R2 직접 전송으로 분리해야 한다.
- GUI 로그인 전에는 LaunchAgent가 실행되지 않으므로 맥미니 재부팅 관통 검증이 남는다.

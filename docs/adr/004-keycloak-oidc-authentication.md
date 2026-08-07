# ADR 004: Keycloak OIDC와 Deuce 권한 모델을 분리

## Status

Accepted

2026-08-07 맥미니 운영 배포는 [ADR 005](005-mac-mini-public-auth-ingress.md)에 따라
구현했다.

## Context

Deuce는 공개 인터넷에서 10명 이하가 사용하는 Windows·Android·iPhone 설치형 앱이다.
현재 서버는 Socket.IO handshake의 `alice`·`bob` 값을 신뢰하고 HTTP 누락 조회에는
인증이 없으므로 외부에 노출할 수 없다.

자체 비밀번호 인증을 구현하면 비밀번호 저장뿐 아니라 로그인 제한, 자격 증명 복구,
MFA, 토큰 갱신과 세션 폐기를 계속 소유해야 한다. Cloudflare Access는 HTTP 또는
사설망의 진입 경계를 보호할 수 있지만 Deuce의 사용자 식별과 워크스페이스·채널별
권한 판정을 대신하지 않는다. 네이티브 앱의 공개 클라이언트가 표준 로그인 흐름을
사용하면서 로그아웃과 관리자 비활성화를 기존 실시간 연결에 즉시 반영할 구조가
필요하다.

## Decision

- 사람 사용자의 신원, 비밀번호, MFA와 로그인 세션은 Keycloak이 관리한다. 자체
  회원가입은 닫고 관리자가 사용자 계정을 만든다.
- 설치형 Flutter 앱은 시스템 브라우저에서 OIDC Authorization Code Flow와 PKCE
  `S256`을 사용한다. 앱은 public client이며 client secret을 포함하지 않는다.
- 플랫폼별 OIDC client를 분리한다. 첫 슬라이스는 `deuce-windows`만 만들고 Android와
  iPhone은 각 플랫폼 관통 시 별도 client와 redirect URI를 추가한다.
- Flutter OIDC 클라이언트는 OpenID Connect 인증과 Windows·Android·iOS 지원을 제공하는
  `oidc` 및 `oidc_default_store`를 사용한다. 패키지 버전은 검증한 버전으로 고정한다.
- Deuce 서버는 `jose`로 고정된 issuer, audience와 JWKS에 대해 access token의 서명과
  표준 claim을 검증한다. 토큰이 제공한 issuer나 JWKS 위치를 동적으로 신뢰하지 않는다.
- Deuce 사용자는 변경 가능한 이메일이나 사용자명이 아니라 OIDC `(issuer, subject)`로
  연결한다. 내부 사용자 ID, 계정 유형, 활성 상태와 표시 이름은 Deuce PostgreSQL이
  관리한다.
- 워크스페이스와 채널 멤버십은 Keycloak role이나 access token에 넣지 않고 Deuce
  PostgreSQL에서 요청마다 확인한다. Keycloak은 인증, Deuce는 애플리케이션 권한의
  원본이다.
- 로그아웃은 OIDC Back-Channel Logout을 수신하고 `(issuer, sid)` 폐기 상태를 access
  token의 최대 수명까지만 저장한다. 사용자 로그아웃과 관리자 비활성화는 해당 세션과
  사용자의 기존 Socket.IO 연결을 즉시 종료한다.
- access token 만료 시 Socket.IO 연결을 종료하고 클라이언트가 갱신된 토큰으로 다시
  연결한다. 연결 미들웨어뿐 아니라 각 명령에서도 현재 사용자, 세션과 채널 권한을
  다시 확인한다.
- access token과 refresh token은 플랫폼 보안 저장소에만 보관하고 서버 DB, 일반 설정,
  오류 응답과 로그에 기록하지 않는다.
- Cloudflare의 현재 제품 범위는 비공개 R2 원본 저장소로 유지한다. Cloudflare Access는
  사용자 로그인이나 채널 권한 계층으로 도입하지 않는다.

## Consequences

- Deuce가 비밀번호 해시, MFA와 로그인 화면을 직접 구현하지 않고 성숙한 OIDC 서버의
  보안 기능을 사용할 수 있다.
- HTTP, Socket.IO와 이후 R2 서명 URL이 동일한 사용자·세션·채널 권한 판정을 공유한다.
- 사용자나 채널 멤버십을 비활성화하면 새 토큰 발급을 기다리지 않고 접근을 차단할 수
  있다.
- Keycloak 서비스, 전용 데이터베이스, TLS, 업그레이드와 백업을 추가로 운영해야 한다.
- 공개 운영 전 Keycloak 로그인 endpoint는 HTTPS로 제공하고 관리자 UI와 Admin API는
  별도 비공개 경계로 제한해야 한다.
- 맥미니 배포는 Windows 로컬 인증 슬라이스를 통과한 뒤 별도 승인된 공개 HTTPS 경로와
  함께 진행해야 한다.

구체적인 요청과 세션 폐기 형식은 [인증 계약 v1](../contracts/auth-v1.md)에 기록한다.

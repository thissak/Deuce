# 인증 계약 v1

Windows 첫 인증 버티컬 슬라이스의 Flutter 클라이언트, Deuce 서버와 Keycloak이 공유하는
계약이다. Android와 iPhone도 동일한 토큰·서버 권한 계약을 사용하고 플랫폼 redirect
URI만 분리한다.

## 역할 경계

- Keycloak은 사람 사용자의 로그인, 비밀번호, MFA, access token, refresh token과 OIDC
  세션을 관리한다.
- Deuce PostgreSQL은 내부 사용자, 계정 활성 상태, 계정 유형과 채널 멤버십을 관리한다.
- Deuce 서버는 모든 HTTP 요청과 Socket.IO 명령에서 인증과 대상 채널 권한을 판정한다.
- 클라이언트는 사용자 ID, 역할이나 채널 권한을 주장하지 않는다.

## OIDC 클라이언트

첫 Windows client ID는 `deuce-windows`다.

- Authorization Code Flow만 활성화한다.
- public client로 설정하고 client secret을 발급하거나 앱에 넣지 않는다.
- PKCE `S256`을 필수로 설정한다.
- Implicit Flow, Direct Access Grants와 Service Account를 비활성화한다.
- Windows redirect URI는 시스템 브라우저와 `127.0.0.1` loopback listener를 사용한다.
- access token의 `aud`에는 Deuce API용 audience가 포함되어야 한다.
- access token과 logout token에는 세션 식별용 `sid`가 있어야 한다.

클라이언트에 포함할 issuer, client ID와 scope는 공개 설정이다. access token과 refresh
token은 비밀이며 플랫폼 보안 저장소 외부에 저장하지 않는다.

## Access token 검증

Deuce 서버는 Bearer token마다 다음 조건을 모두 확인한다.

1. `Authorization` header 또는 Socket.IO handshake의 지정된 `accessToken` 필드에서만
   token을 받는다. URL query와 메시지 payload에서는 받지 않는다.
2. 설정된 JWKS의 키로 서명을 검증한다.
3. `iss`가 설정된 Keycloak realm issuer와 정확히 일치해야 한다.
4. `aud`에 설정된 Deuce API audience가 포함되어야 한다.
5. `exp`, `nbf`와 허용한 서명 알고리즘을 검증한다.
6. `sub`와 `sid`가 비어 있지 않아야 한다.
7. `(iss, sub)`에 연결된 Deuce 사용자가 존재하고 활성 상태여야 한다.
8. `(iss, sid)`가 폐기되지 않아야 한다.

이메일, 사용자명, 표시 이름과 token의 role claim은 Deuce 내부 사용자 ID나 채널 권한의
근거로 사용하지 않는다.

## HTTP 인증

보호된 HTTP 요청은 다음 header를 사용한다.

```text
Authorization: Bearer <access-token>
```

- token이 없거나 잘못됐거나 만료·폐기됐으면 `401 {"error":"unauthorized"}`다.
- 신원은 유효하지만 Deuce 사용자가 비활성화됐거나 대상 채널 멤버가 아니면
  `403 {"error":"forbidden"}`다.
- `/health`만 인증 없이 사용할 수 있다.
- `/me`, `/messages`와 이후 파일 서명 URL endpoint는 모두 보호한다.
- `GET /me`는 Deuce 내부 사용자 `id`, `displayName`, `actorType`만 반환한다.

## Socket.IO 인증과 명령 권한

연결 handshake는 다음 `auth` 값을 사용한다.

```json
{ "accessToken": "<access-token>" }
```

- 연결 시 access token, 사용자 활성 상태, 세션 폐기와 `general` 멤버십을 확인한다.
- 실패한 연결은 `unauthorized` 또는 `forbidden` 오류로 거절한다.
- 연결된 socket은 사용자, OIDC 세션과 허용된 채널 room에만 참여한다.
- `message:send`를 포함한 각 명령에서 사용자 활성 상태, 세션 폐기와 채널 쓰기 권한을
  다시 확인한다.
- access token 만료 시 server가 연결을 종료한다. client는 token을 갱신한 뒤 새
  handshake로 연결한다.
- 로그아웃, 세션 폐기 또는 사용자 비활성화 시 관련 socket을 즉시 종료한다.

## 로그아웃과 세션 폐기

사용자 로그아웃 순서는 다음과 같다.

1. client가 현재 Bearer token으로 `POST /auth/logout`을 호출한다.
2. Deuce 서버가 `(iss, sid)`를 token 만료 시점까지만 폐기 상태로 저장한다.
3. Deuce 서버가 같은 세션의 Socket.IO 연결을 종료하고 `204`를 반환한다.
4. client가 Keycloak RP-Initiated Logout을 수행한다.
5. client가 플랫폼 보안 저장소의 access token과 refresh token을 삭제한다.

Keycloak은 `POST /auth/backchannel-logout`에 form field `logout_token`을 보낸다. 서버는
logout token의 서명, `typ`, `iss`, `aud`, `iat`, `exp`, `jti`, back-channel logout
`events` claim과 `sid`를 검증한 뒤 같은 폐기와 연결 종료를 멱등하게 수행한다.

관리자 비활성화는 Deuce 사용자 `disabled_at`을 먼저 기록하고 해당 사용자의 모든
Socket.IO 연결을 종료한다. Keycloak 계정 비활성화와 세션 로그아웃은 함께 수행하지만,
외부 호출이 늦거나 실패해도 Deuce의 로컬 차단은 즉시 적용된다.

Deuce 관리자는 자신의 Bearer token으로 `POST /admin/users/:userId/disable`을 호출해
로컬 사용자를 즉시 비활성화한다. 관리자가 아닌 사용자는 `403`, 없는 사용자는 `404`다.
Keycloak Admin API 연결은 realm 배포 단계에서 별도 승인 후 추가한다.

첫 관리자와 사용자는 서버 CLI에서 OIDC `sub`와 표시 이름을 연결한다. token이나
비밀번호를 CLI 인자로 전달하지 않는다.

```text
npm run user:provision -- --subject <keycloak-sub> --name <display-name> [--admin]
```

## 서버 설정

서버 비밀 파일은 저장소 밖에 두고 권한을 제한한다.

```text
DEUCE_OIDC_ISSUER=https://auth.example.com/realms/deuce
DEUCE_OIDC_AUDIENCE=deuce-api
DEUCE_OIDC_JWKS_URL=https://auth.example.com/realms/deuce/protocol/openid-connect/certs
DEUCE_OIDC_LOGOUT_AUDIENCE=deuce-windows
DEUCE_OIDC_ACCESS_TOKEN_MAX_AGE_SECONDS=300
```

값 자체는 비밀번호가 아니지만 운영 인증 경계를 변경하므로 배포 설정으로 관리한다.
issuer와 JWKS는 HTTPS만 허용하며 로컬 개발용 loopback HTTP만 예외다. 서버는 token,
Authorization header와 Socket.IO `accessToken`을 로그에 남기지 않는다.

## 첫 슬라이스 완료 기준

- `alice`·`bob` handshake fixture와 클라이언트 사용자 선택기가 제거된다.
- 관리자가 만든 사용자가 Windows 시스템 브라우저에서 로그인한다.
- 같은 access token으로 `/messages`와 Socket.IO 연결을 인증한다.
- `general` 멤버만 메시지를 조회·전송·구독한다.
- 만료, 잘못된 audience, 폐기 세션, 비활성 사용자와 비멤버를 자동 테스트한다.
- 로그아웃과 back-channel logout이 기존 Socket.IO 연결을 종료한다.
- token과 세션 비밀이 저장소, 일반 설정, 오류 응답과 로그에 남지 않는다.
- 이 검증이 끝나기 전 서버는 계속 loopback에만 바인딩한다.

# 인증된 메시지 로컬 실행

## 범위와 현재 상태

Windows Flutter 앱이 시스템 브라우저로 Keycloak에 로그인하고 같은 access token으로
Deuce의 HTTP와 Socket.IO를 사용한다. 서버는 OIDC 신원을 Deuce 내부 사용자에 연결하고
`general` 멤버십을 요청마다 확인한다.

코드와 로컬 서명 token 기반 통합 테스트에 더해 Keycloak 26.7 loopback realm에서 실제
Windows 로그인, access token 갱신, Socket 재연결과 로그아웃을 관통 검증했다. 공개
인프라는 아직 연결하지 않았으며 서버는 `127.0.0.1`에서만 실행한다. 맥미니의 기존
비공개 스테이징도 아직 이 인증 코드로 업데이트하지 않았다.

## 개발 환경

| 구성 | 현재 개발 환경 |
|---|---|
| Flutter | `C:\Tools\flutter`, stable 3.44.8 |
| Windows 빌드 | Visual Studio Build Tools 2022, Windows 11 SDK, Visual C++ ATL |
| Windows C++ 도구셋 | MSVC 14.44 (`VCToolsVersion=14.44.35207`) |
| 서버 런타임 | Node.js 24 |
| 데이터베이스 | PostgreSQL 17, `deuce_dev` |
| 자동 통합 테스트 | PostgreSQL `deuce_test` |
| 로컬 인증 서버 | Keycloak 26.7.0, Microsoft OpenJDK 25 |
| OIDC 클라이언트 | `oidc` 4.0.0, `oidc_default_store` 1.1.2 |

데이터베이스 접속 문자열은 저장소에 기록하지 않는다. Windows 사용자 환경 변수
`DEUCE_DATABASE_URL`과 `DEUCE_TEST_DATABASE_URL`에 개발 DB와 테스트 DB 접속 문자열이
설정되어 있다. OIDC issuer와 audience는 비밀번호가 아니지만 인증 경계를 바꾸므로
실제 realm을 만들 때 배포 환경 값으로 관리한다.

## 실제 Keycloak loopback 실행

로컬 realm, `deuce-windows` public client와 `alice`·`bob` 사용자는 다음 스크립트로
준비한다. Keycloak 배포본은 `C:\Tools\keycloak-26.7.0`, Microsoft OpenJDK 25는 기본
설치 위치에 있어야 한다.

```powershell
cd D:\Projects\Deuce
.\scripts\keycloak\start-local-keycloak.ps1
.\scripts\keycloak\start-local-deuce-server.ps1
.\scripts\keycloak\start-local-windows-client.ps1
```

사용자 비밀번호는 저장소에 넣지 않고 현재 Windows 사용자만 복호화할 수 있는 DPAPI
파일로 `%LOCALAPPDATA%\Deuce\keycloak`에 둔다. 로그인할 비밀번호는 평문 출력 없이
클립보드로 복사한다.

```powershell
.\scripts\keycloak\copy-local-user-password.ps1 -User alice
```

종료할 때는 앱을 닫은 뒤 Deuce 서버와 Keycloak을 순서대로 중지한다.

```powershell
.\scripts\keycloak\stop-local-deuce-server.ps1
.\scripts\keycloak\stop-local-keycloak.ps1
```

## 서버 설정과 실행

실제 Keycloak realm을 준비한 뒤 현재 PowerShell에 다음 값을 넣는다. 예시 도메인을
그대로 사용하면 안 된다.

```powershell
cd D:\Projects\Deuce\apps\server
$env:DEUCE_DATABASE_URL = [Environment]::GetEnvironmentVariable(
    'DEUCE_DATABASE_URL',
    'User'
)
$env:DEUCE_OIDC_ISSUER = 'https://auth.example.com/realms/deuce'
$env:DEUCE_OIDC_AUDIENCE = 'deuce-api'
$env:DEUCE_OIDC_JWKS_URL = `
    'https://auth.example.com/realms/deuce/protocol/openid-connect/certs'
$env:DEUCE_OIDC_LOGOUT_AUDIENCE = 'deuce-windows'

npm ci
npm run db:migrate
npm run dev
```

서버는 기본적으로 `http://127.0.0.1:3210`에서만 수신한다. `/health`만 Bearer token 없이
응답하고 `/me`, `/messages`와 Socket.IO는 모두 인증을 요구한다.

## Deuce 사용자 연결

Keycloak 사용자를 만든 것만으로 채널 접근 권한이 생기지 않는다. 해당 사용자의 OIDC
`sub`를 Deuce 사용자에 연결하고 `general` 멤버십을 추가한다.

```powershell
npm run user:provision -- `
  --subject '<keycloak-sub>' `
  --name '표시 이름' `
  --admin
```

`--admin`은 첫 로컬 관리자에게만 사용한다. 같은 `(issuer, sub)`로 다시 실행하면 표시
이름과 멤버십을 갱신하고 비활성 상태를 해제한다. access token이나 refresh token을
인자로 전달하지 않는다.

## Windows 앱 빌드와 실행

이 PC에는 MSVC 14.33과 14.44가 함께 있어 현재 셸의 도구셋을 14.44로 지정한다. ATL은
14.44에 설치되어 있으며 재부팅은 필요하지 않다.

```powershell
cd D:\Projects\Deuce\apps\client
$env:VCToolsVersion = '14.44.35207'
C:\Tools\flutter\bin\flutter.bat build windows `
  --dart-define=DEUCE_OIDC_ISSUER=https://auth.example.com/realms/deuce `
  --dart-define=DEUCE_OIDC_CLIENT_ID=deuce-windows `
  --dart-define=DEUCE_SERVER_URL=http://127.0.0.1:3210

& .\build\windows\x64\runner\Release\deuce_client.exe
```

앱은 `http://127.0.0.1:0` loopback redirect와 시스템 브라우저를 사용한다. Keycloak의
`deuce-windows` public client에는 Authorization Code Flow와 PKCE `S256`만 허용하고
등록한 loopback redirect, `deuce-api` audience와 `sid` mapper가 있어야 한다. 앱에는
client secret을 넣지 않는다.

로그인 후 `Enter`는 메시지를 전송하고 `Shift+Enter`는 줄을 바꾼다. 로그아웃은 Deuce
세션을 먼저 폐기하고 연결된 Socket.IO를 끊은 다음 Keycloak 로그아웃과 로컬 보안 저장소
삭제를 수행한다.

같은 `http://127.0.0.1:3210` 주소를 유지한 채 Windows 로컬 DB와 SSH 너머 맥미니 DB를
전환하면 현재 앱 프로세스의 기존 메시지와 마지막 복구 순번이 남는다. 서로 다른 DB의
같은 sequence가 한 화면에 섞일 수 있으므로 이 전환 테스트 전에는 앱을 종료하고 다시
실행한다. 서버별 PostgreSQL 저장 순서는 정상이며 클라이언트 상태 초기화는 후속 작업이다.

## 자동 검증

서버 테스트는 실제 Keycloak 없이 테스트용 RSA 서명 token을 만들며 운영 token을
기록하지 않는다. 테스트 DB에 최신 마이그레이션을 먼저 적용한다.

```powershell
cd D:\Projects\Deuce\apps\server
$env:DEUCE_TEST_DATABASE_URL = [Environment]::GetEnvironmentVariable(
    'DEUCE_TEST_DATABASE_URL',
    'User'
)
$env:DEUCE_DATABASE_URL = $env:DEUCE_TEST_DATABASE_URL
npm run db:migrate
npm run build
npm test
```

검증 범위는 서명·issuer·audience·만료, 미등록·비활성·비멤버 사용자, 메시지 저장·방송·
중복 방지·복구, 명령별 권한 재확인, 로컬 및 back-channel logout, 관리자 비활성화의 기존
Socket 즉시 종료다.

Flutter 분석, 화면·Bearer header 테스트와 Windows 빌드:

```powershell
cd D:\Projects\Deuce\apps\client
$env:VCToolsVersion = '14.44.35207'
C:\Tools\flutter\bin\flutter.bat analyze
C:\Tools\flutter\bin\flutter.bat test
C:\Tools\flutter\bin\flutter.bat build windows
```

두 사용자의 짧은 access token을 현재 PowerShell 프로세스에만 넣고 Flutter 컨트롤러
관통 테스트를 실행할 수도 있다. token을 사용자 환경 변수로 영구 저장하지 않는다.
스크립트는 임시 dart-define 파일을 종료 시 삭제한다.

```powershell
$env:DEUCE_LIVE_ACCESS_TOKEN_ALICE = '<short-lived-token>'
$env:DEUCE_LIVE_ACCESS_TOKEN_BOB = '<short-lived-token>'
.\scripts\test-live-slice.ps1
```

## 보안 경계

- `alice`·`bob` 개발 handshake와 앱 사용자 선택기는 제거됐다.
- access token은 Authorization header와 Socket.IO handshake `auth.accessToken`에서만
  받고 URL query, 메시지 payload와 로그에는 넣지 않는다.
- refresh token과 access token은 `oidc_default_store`가 Windows 보안 저장소에 보관한다.
- 실제 Keycloak loopback 관통은 완료했지만 공개 HTTPS와 방화벽 검증 전에는 외부
  바인딩, 공개 DNS, 포트포워딩과 Cloudflare Tunnel을 사용하지 않는다.
- Cloudflare의 현재 범위는 비공개 R2 원본 저장소이며 사용자 인증에 사용하지 않는다.
- `drizzle-kit`의 개발 전용 하위 의존성에서 moderate 감사 항목 4개가 보고된다. 자동
  수정은 현재 버전을 구버전으로 내리므로 적용하지 않으며 마이그레이션 CLI를 외부에
  노출하지 않는다.

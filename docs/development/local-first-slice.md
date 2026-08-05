# 첫 메시지 로컬 실행

## 범위

Windows PC 한 대에서 로컬 서버와 Deuce 앱 두 개를 실행해 텍스트 메시지의 저장,
실시간 수신, 재접속 복구를 확인한다. 이 구성에는 운영 인증이 없으므로 로컬 개발
용도이며 외부에 공개하지 않는다.

## 준비된 구성

| 구성 | 현재 개발 환경 |
|---|---|
| Flutter | `C:\Tools\flutter`, stable 3.44.8 |
| Windows 빌드 | Visual Studio Build Tools 2022, Windows 11 SDK |
| 서버 런타임 | Node.js 24 |
| 데이터베이스 | PostgreSQL 17, `deuce_dev` |
| 자동 관통 테스트 | PostgreSQL `deuce_test`, 로컬 포트 3211 |

데이터베이스 접속 문자열은 파일에 저장하지 않는다. 현재 Windows 사용자 환경 변수
`DEUCE_DATABASE_URL`과 `DEUCE_TEST_DATABASE_URL`에 각각 개발 DB와 테스트 DB 접속
문자열이 설정되어 있다.

## 서버 실행

새 PowerShell을 열거나 사용자 환경 변수를 현재 셸로 가져온 뒤 서버를 시작한다.

```powershell
cd D:\Projects\Deuce\apps\server
$env:DEUCE_DATABASE_URL = [Environment]::GetEnvironmentVariable(
    'DEUCE_DATABASE_URL',
    'User'
)
npm install
npm run db:migrate
npm run dev
```

서버는 기본적으로 `http://127.0.0.1:3210`에서만 수신한다. 상태 확인 주소는
`http://127.0.0.1:3210/health`다.

## Windows 앱 두 개 실행

다른 PowerShell에서 릴리스 앱을 빌드하고 두 인스턴스를 실행한다.

```powershell
cd D:\Projects\Deuce\apps\client
C:\Tools\flutter\bin\flutter.bat build windows
$deuceExe = Resolve-Path `
    '.\build\windows\x64\runner\Release\deuce_client.exe'
Start-Process $deuceExe
Start-Process $deuceExe
```

한 창은 `Alice`, 다른 창은 `Bob`을 선택한다. 두 창 모두 우측 상단 상태가 `연결됨`이
되면 메시지를 보낸다.

재접속 복구는 Bob 창을 닫고 Alice가 메시지를 보낸 다음 Bob 앱을 다시 실행해
확인한다. 서버 재시작 보존은 서버를 종료했다가 같은 명령으로 다시 시작한 뒤 기존
메시지와 새 메시지 순번이 이어지는지 확인한다.

## 자동 검증

서버 타입 검사와 실제 PostgreSQL·WebSocket 통합 테스트:

```powershell
cd D:\Projects\Deuce\apps\server
$env:DEUCE_TEST_DATABASE_URL = [Environment]::GetEnvironmentVariable(
    'DEUCE_TEST_DATABASE_URL',
    'User'
)
npm run build
npm test
```

Flutter 분석, 단위·화면 테스트와 Windows 빌드:

```powershell
cd D:\Projects\Deuce\apps\client
C:\Tools\flutter\bin\flutter.bat analyze
C:\Tools\flutter\bin\flutter.bat test
C:\Tools\flutter\bin\flutter.bat build windows
```

테스트 DB 서버를 임시로 띄우고 실제 Flutter 컨트롤러 두 개의 송수신과 누락 복구를
검증하는 관통 테스트:

```powershell
cd D:\Projects\Deuce
.\scripts\test-live-slice.ps1
```

## 현재 보안 경계

- `alice`와 `bob`은 인증 계정이 아니라 개발 fixture다.
- 서버 기본값은 loopback 전용이며 외부 바인딩이나 포트 개방을 하지 않는다.
- Cloudflare Access, Tunnel, DNS는 사용하지 않는다.
- R2는 다음 파일 공유 슬라이스에서 비공개 원본 저장소로 연결한다.
- `drizzle-kit`의 개발 전용 하위 의존성에서 moderate 감사 항목 4개가 보고된다. 자동
  수정은 현재 버전을 구버전으로 내리므로 적용하지 않았으며, 마이그레이션 CLI를
  외부에 노출하지 않는다.

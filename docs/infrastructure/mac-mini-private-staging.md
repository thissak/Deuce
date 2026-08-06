# 맥미니 비공개 스테이징 서버

## 상태와 목적

이 문서는 Deuce 서버의 macOS 실행, PostgreSQL 보존, 프로세스 자동 재시작과 SSH 터널
연결을 검증한 비공개 스테이징 절차다. 실제 운영 배포나 공개 인터넷 노출 절차가 아니다.

2026-08-06 맥미니에 설치한 커밋 `05e8c07`은 `alice`·`bob` 개발 fixture를 사용하는
이전 스냅샷이다. 현재 저장소에는 Keycloak OIDC 인증이 구현됐지만 실제 realm 관통 전이라
맥미니에는 아직 업데이트하지 않았다. 두 버전 모두 HTTP와 Socket.IO를 반드시
`127.0.0.1`에만 바인딩한다. Windows 검증은 Tailscale 위의 SSH 로컬 포트 포워딩을
사용하며 공유기 포트포워딩, 공개 DNS, Cloudflare Tunnel과 외부 바인딩은 별도 승인과
공개 전 검증이 끝날 때까지 금지한다.

## 설치 구조

```text
Windows Deuce 앱 ── 127.0.0.1:3210
        │
        └─ SSH local forward over Tailscale
                    │
                    ▼
              ai-macmini SSH
                    │
                    └─ 127.0.0.1:3210 ── Deuce LaunchAgent
                                               │
                                               ▼
                                         PostgreSQL
```

LaunchAgent는 로그인한 맥미니 사용자 세션에서 서버를 시작하고 비정상 종료 시 다시
실행한다. 로그인 전 부팅 단계부터 실행되는 LaunchDaemon은 실제 인증, 비밀 관리와
운영 경로를 확정한 뒤 별도로 검토한다.

## 사전 조건

- 맥미니의 macOS 계정으로 공개키 SSH 로그인이 가능해야 한다.
- Tailscale 장치 이름 `ai-macmini`에 도달할 수 있어야 한다.
- 맥미니에 Git, 프로젝트가 지원하는 Node.js, npm과 PostgreSQL이 설치되어 있어야 한다.
- 비공개 GitHub 저장소를 clone 또는 pull하거나, 감독님이 승인한 커밋의 검증된 Git
  아카이브를 전송할 수 있어야 한다.
- 맥미니에 그래픽 로그인 세션이 유지되어 `gui/<uid>` LaunchAgent 도메인이 존재해야 한다.

CPU가 Apple Silicon인지 Intel인지에 따라 Homebrew 경로가 다르므로 `/opt/homebrew`나
`/usr/local`을 문서에 고정하지 않는다. 설치 스크립트가 실행 시점의 절대 Node 경로를
LaunchAgent plist에 기록한다.

## 확인된 SSH 연결

2026-08-06 기준 Windows 개발 PC에서 다음 연결을 확인했다.
맥미니의 다른 프로젝트, 현재 리스너와 Cloudflare ingress를 포함한 공용 인벤토리
SSOT는 `C:\Users\qart\.claude\reference\infrastructure.md`다. 이 문서는 Deuce 전용
설치와 검증 절차만 소유한다.

| 항목 | 확인값 |
|---|---|
| Tailscale 장치 | `ai-macmini` (`100.82.164.112`) |
| macOS 계정 | `afred` |
| 인증 방식 | Ed25519 공개키 |
| Windows 키 경로 | `C:\Users\qart\.ssh\id_ed25519` |
| 공개키 지문 | `SHA256:rnMtNJdPQjKDlTsA6tbHLdA7f/IH5m8CFT7uJPJCFi0` |

비대화형 연결은 다음 명령으로 성공했다.

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes `
  afred@100.82.164.112 'exit 0'
```

맥미니가 이미 이 공개키를 수락하므로 새 키를 만들거나 `authorized_keys`를 다시 수정할
필요가 없다. 문서에는 공개키 지문만 기록하며 비밀키 내용과 암호는 저장하지 않는다.

## 2026-08-06 설치 결과

| 항목 | 확인값 |
|---|---|
| 배포 소스 | 커밋 `05e8c07`, Windows에서 SHA-256을 확인한 Git 아카이브와 후속 수정 파일 전송 |
| 서버 경로 | `/Users/afred/Projects/Deuce` |
| Deuce Node | keg-only Node 24.19.0, `/opt/homebrew/opt/node@24/bin/node` |
| PostgreSQL | 17.10, Homebrew LaunchAgent, `127.0.0.1`·`::1` 전용 |
| DB | `deuce`, 소유 역할 `deuce_app`, TCP SCRAM-SHA-256 |
| 환경 파일 | `/Users/afred/Library/Application Support/Deuce/server.env`, 권한 `600` |
| 서버 서비스 | `com.goldenlab.deuce-server`, `127.0.0.1:3210` |

맥미니에는 비공개 GitHub 저장소를 읽을 비대화형 자격증명이 없어 새 토큰을 만들지 않고
커밋 스냅샷을 전송했다. 의존성 설치와 타입 검사·실행 빌드, Drizzle 마이그레이션,
health 응답을 Node 24에서 확인했다.

LaunchAgent가 관리하는 Node 프로세스를 `SIGKILL`했을 때 PID가 바뀌며 자동 복구됐다.
재시작 전 테스트 메시지 순번 `1`이 유지됐고 재시작 후 메시지가 순번 `2`로 이어졌다.
Windows SSH 로컬 포워딩에서도 health와 두 메시지를 조회했다. 기존 Caddy, cloudflared,
Gitea, GitHub Actions runner와 공개 원본 여섯 곳은 설치 후에도 정상 동작했다.

맥미니 자체 로그아웃·로그인 또는 재부팅 검증은 아직 수행하지 않았다.

## PostgreSQL 준비

Homebrew를 사용하는 경우 프로젝트의 검증 버전과 호환되는 PostgreSQL을 설치하고
서비스로 시작한다. 아래 예시는 PostgreSQL 17을 유지할 때의 명령이다.

```zsh
brew install node@24 postgresql@17
brew services start postgresql@17

postgres_bin="$(brew --prefix postgresql@17)/bin"
"$postgres_bin/createuser" --pwprompt deuce_app
"$postgres_bin/createdb" --owner=deuce_app deuce
```

비밀번호는 저장소, 셸 기록과 문서에 입력하지 않는다. PostgreSQL URL에 예약 문자가
있는 비밀번호를 사용할 때는 URL 인코딩한다.

Homebrew가 새로 만든 클러스터의 TCP 규칙이 `trust`라면 그대로 사용하지 않는다.
로컬 관리용 Unix socket은 `trust`로 유지할 수 있지만 `127.0.0.1/32`와 `::1/128`의
host·replication 규칙은 `scram-sha-256`으로 제한하고 틀린 비밀번호가 거부되는지
확인한다.

## 서버 환경 파일

서버 환경은 저장소 밖의 다음 파일에 둔다.

```text
~/Library/Application Support/Deuce/server.env
```

초기 파일은 저장소 예제를 복사한 뒤 맥미니 안에서 편집한다.

```zsh
deuce_env="$HOME/Library/Application Support/Deuce/server.env"
mkdir -p "${deuce_env:h}"
cp apps/server/.env.example "$deuce_env"
chmod 600 "$deuce_env"
nano "$deuce_env"
```

필수 형식:

```dotenv
DEUCE_DATABASE_URL=postgresql://deuce_app:<encoded-password>@127.0.0.1:5432/deuce
DEUCE_OIDC_ISSUER=https://auth.example.com/realms/deuce
DEUCE_OIDC_AUDIENCE=deuce-api
DEUCE_OIDC_JWKS_URL=https://auth.example.com/realms/deuce/protocol/openid-connect/certs
DEUCE_OIDC_LOGOUT_AUDIENCE=deuce-windows
DEUCE_OIDC_ACCESS_TOKEN_MAX_AGE_SECONDS=300
HOST=127.0.0.1
PORT=3210
```

이 파일은 셸에서 실행하지 않고 Node의 `--env-file`로 읽는다. 설치 스크립트는 권한을
`600`으로 고정하고 DB 및 필수 OIDC 설정이 모두 있는지 확인하며 실행 로그에 값을
출력하지 않는다. 예시 도메인을 실제 설정 없이 사용하지 않는다.

## 빌드와 마이그레이션

저장소 루트에서 다음을 실행한다.

```zsh
export PATH="$(brew --prefix node@24)/bin:$PATH"
cd apps/server
npm ci
npm run build

deuce_env="$HOME/Library/Application Support/Deuce/server.env"
deuce_node="$(brew --prefix node@24)/bin/node"
"$deuce_node" --env-file="$deuce_env" node_modules/drizzle-kit/bin.cjs migrate
cd ../..
```

`npm run build`는 타입 검사를 통과한 뒤 `apps/server/dist/`에 실행용 JavaScript를
생성한다. LaunchAgent는 개발용 `tsx`가 아니라 현재 설치된 Node의 절대 경로로
`dist/index.js`를 실행한다.

## LaunchAgent 설치

```zsh
deuce_env="$HOME/Library/Application Support/Deuce/server.env"
DEUCE_NODE_BIN="$(brew --prefix node@24)/bin/node" \
  /bin/zsh scripts/macos/install-launch-agent.zsh "$deuce_env"
```

설치 스크립트는 다음 로컬 파일을 만든다.

| 경로 | 용도 |
|---|---|
| `~/Library/LaunchAgents/com.goldenlab.deuce-server.plist` | 현재 사용자 LaunchAgent |
| `~/Library/Logs/Deuce/server.stdout.log` | 표준 로그 |
| `~/Library/Logs/Deuce/server.stderr.log` | 오류 로그 |

소스 템플릿에는 비밀값이 없다. 생성된 plist도 Node, 저장소와 환경 파일의 절대 경로만
가지며 데이터베이스 URL을 포함하지 않는다. 실행 래퍼가 프로세스 환경의
`HOST=127.0.0.1`을 강제하고 Node 환경 파일의 같은 이름 값보다 우선시킨다.

## 맥미니 로컬 검증

```zsh
service="gui/$(id -u)/com.goldenlab.deuce-server"
launchctl print "$service"
curl --fail --silent http://127.0.0.1:3210/health
lsof -nP -iTCP:3210 -sTCP:LISTEN
tail -n 100 "$HOME/Library/Logs/Deuce/server.stderr.log"
```

검증 기준:

- health 응답이 성공한다.
- 수신 주소가 `127.0.0.1:3210`이며 `*:3210` 또는 외부 주소가 아니다.
- 프로세스를 비정상 종료하면 launchd가 다시 시작한다.
- 맥미니 로그인 이후 LaunchAgent가 자동 시작한다.
- 서버 재시작 뒤 기존 메시지가 유지되고 새 메시지 순번이 이어진다.

## Windows 앱 SSH 터널 검증

Windows에서 확인된 맥미니 계정과 Tailscale 주소로 로컬 포트 포워딩을 연다.

```powershell
ssh -N -L 3210:127.0.0.1:3210 afred@100.82.164.112
```

터널을 유지한 채 Windows 앱의 `DEUCE_SERVER_URL`은 기존과 똑같이
`http://127.0.0.1:3210`을 사용한다. 네트워크 단절, SSH 터널 재연결과 서버 재시작 뒤
메시지 복구가 기존 로컬 슬라이스와 같아야 한다.

## 업데이트와 되돌리기

코드 업데이트는 서버 루트에서 의존성 설치, 검증, 마이그레이션 순서로 수행한 뒤
LaunchAgent를 다시 시작한다. 인증 마이그레이션은 실제 Keycloak 설정과 첫 Deuce 사용자
연결을 준비한 뒤에만 배포한다.

```zsh
export PATH="$(brew --prefix node@24)/bin:$PATH"
cd apps/server
npm ci
npm run build
deuce_env="$HOME/Library/Application Support/Deuce/server.env"
deuce_node="$(brew --prefix node@24)/bin/node"
"$deuce_node" --env-file="$deuce_env" node_modules/drizzle-kit/bin.cjs migrate

service="gui/$(id -u)/com.goldenlab.deuce-server"
launchctl kickstart -k "$service"
```

LaunchAgent만 제거할 때는 다음을 사용한다. 데이터베이스와 환경 파일은 자동 삭제하지
않는다.

```zsh
service="gui/$(id -u)/com.goldenlab.deuce-server"
launchctl bootout "$service"
rm "$HOME/Library/LaunchAgents/com.goldenlab.deuce-server.plist"
```

## 인증 코드 배포와 공개 전 남은 조건

- 실제 Keycloak realm 설치와 Windows 시스템 브라우저 로그인 관통 검증
- Keycloak 사용자 `sub`와 Deuce 사용자·`general` 멤버십 연결
- 운영 issuer·audience·JWKS와 back-channel logout 등록 검증
- PostgreSQL 자동 백업과 복원 연습
- HTTPS 진입점, 인증서와 공개 네트워크 방식 결정
- 외부 노출 전 방화벽과 로그의 비밀정보 점검
- 인증된 Windows·Android·iPhone 클라이언트 검증

위 조건이 끝나기 전에는 이 스테이징 구성을 운영 또는 공개 서버로 간주하지 않는다.

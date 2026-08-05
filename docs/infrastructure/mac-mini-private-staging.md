# 맥미니 비공개 스테이징 서버

## 상태와 목적

이 문서는 인증 구현 전 Deuce 서버를 맥미니에 설치해 macOS 실행, PostgreSQL 보존,
프로세스 자동 재시작과 SSH 터널 연결을 검증하는 절차다. 실제 운영 배포나 공개 인터넷
노출 절차가 아니다.

현재 서버는 `alice`·`bob` 개발 fixture를 신뢰하므로 HTTP와 Socket.IO 모두 반드시
`127.0.0.1`에만 바인딩한다. Windows 클라이언트 검증은 Tailscale 위의 SSH 로컬 포트
포워딩을 사용한다. 공유기 포트포워딩, 공개 DNS, Cloudflare Tunnel과 외부 바인딩은
인증 슬라이스가 통과하기 전까지 금지한다.

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
- 비공개 GitHub 저장소를 clone 또는 pull할 권한이 있어야 한다.
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

## PostgreSQL 준비

Homebrew를 사용하는 경우 프로젝트의 검증 버전과 호환되는 PostgreSQL을 설치하고
서비스로 시작한다. 아래 예시는 PostgreSQL 17을 유지할 때의 명령이다.

```zsh
brew install node postgresql@17
brew services start postgresql@17

postgres_bin="$(brew --prefix postgresql@17)/bin"
"$postgres_bin/createuser" --pwprompt deuce_app
"$postgres_bin/createdb" --owner=deuce_app deuce
```

비밀번호는 저장소, 셸 기록과 문서에 입력하지 않는다. PostgreSQL URL에 예약 문자가
있는 비밀번호를 사용할 때는 URL 인코딩한다.

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
HOST=127.0.0.1
PORT=3210
```

이 파일은 셸에서 실행하지 않고 Node의 `--env-file`로 읽는다. 설치 스크립트는 권한을
`600`으로 고정하며 실행 로그에 값을 출력하지 않는다.

## 빌드와 마이그레이션

저장소 루트에서 다음을 실행한다.

```zsh
cd apps/server
npm ci
npm run build

deuce_env="$HOME/Library/Application Support/Deuce/server.env"
node --env-file="$deuce_env" node_modules/drizzle-kit/bin.cjs migrate
cd ../..
```

`npm run build`는 타입 검사를 통과한 뒤 `apps/server/dist/`에 실행용 JavaScript를
생성한다. LaunchAgent는 개발용 `tsx`가 아니라 현재 설치된 Node의 절대 경로로
`dist/index.js`를 실행한다.

## LaunchAgent 설치

```zsh
deuce_env="$HOME/Library/Application Support/Deuce/server.env"
DEUCE_NODE_BIN="$(command -v node)" \
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
LaunchAgent를 다시 시작한다.

```zsh
cd apps/server
npm ci
npm run build
deuce_env="$HOME/Library/Application Support/Deuce/server.env"
node --env-file="$deuce_env" node_modules/drizzle-kit/bin.cjs migrate

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

## 공개 전 남은 조건

- 실제 사용자 인증과 `general` 채널 권한 관통 검증
- 운영용 세션 폐기와 비밀 관리
- PostgreSQL 자동 백업과 복원 연습
- HTTPS 진입점, 인증서와 공개 네트워크 방식 결정
- 외부 노출 전 방화벽과 로그의 비밀정보 점검
- 인증된 Windows·Android·iPhone 클라이언트 검증

위 조건이 끝나기 전에는 이 스테이징 구성을 운영 또는 공개 서버로 간주하지 않는다.

# 자체 서버 운영

대화할 사용자들은 같은 Deuce 서버에 접속합니다. 서버가 다르면 계정·채널·대화도
별개이며 서버 간 연합 통신은 지원하지 않습니다. 프로젝트 운영자의 GCP 권한이나
계정은 필요하지 않습니다. 서버·DB·스토리지·도메인 비용은 인스턴스 운영자가 부담합니다.

## 서버 설치

HTTPS 프록시 → Node.js 24의 Deuce 프로세스 → PostgreSQL 16 이상과 첨부 디렉터리를
사용합니다. 현재 단일 프로세스 기준이며 다중 인스턴스용 소켓 어댑터는 없습니다.
PostgreSQL의 `pg_trgm` 확장을 마이그레이션에서 생성할 수 있어야 합니다. GCP는 선택 사항입니다.

1. Node 24와 pnpm 11.24.0, PostgreSQL을 설치하고 전용 DB·역할을 만듭니다.
2. 소스에서 `pnpm install --frozen-lockfile`, `pnpm --filter @deuce/server exec prisma generate`,
   `pnpm --filter @deuce/web build`를 실행합니다.
3. [운영 환경 예제](../deploy/deuce.env.example)를 비공개 환경 파일에 복사해 채웁니다.
   `SESSION_KEY_HEX`는 `openssl rand -hex 32`로 생성합니다.
4. 자신의 Google 웹 OAuth 콜백을 `https://chat.example.com/auth/google/callback`처럼 등록합니다.
   `ALLOWED_EMAILS`에는 초대할 계정을 입력합니다. 현재 임의 회원가입은 없습니다.
5. 백업 후 `prisma migrate deploy`를 실행합니다. 운영 DB에는 테스트나 `migrate dev`를 실행하지 않습니다.
6. 서버를 시작하고 HTTPS 프록시가 웹·`/auth`·`/api`·`/socket.io`를 전달하도록 설정합니다.
   WebSocket을 지원해야 합니다. PostgreSQL 포트는 인터넷에 공개하지 않습니다.

환경 파일을 **`apps/server/.env`**에 준비했다면 다음과 같이 실행합니다.
파일과 업로드 경로는 서버 사용자만 읽고 쓰게 설정합니다.

```bash
pnpm --filter @deuce/server exec prisma migrate deploy
pnpm --filter @deuce/server exec node --env-file=.env --import tsx src/main.ts
```

환경 파일이 `/etc/deuce/deuce.env`에 있다면 서비스 관리자가 변수를 주입해야 합니다.
Prisma CLI는 해당 경로를 자동으로 읽지 않습니다. `WEB_DIST_DIR`은 빌드한 `apps/web/dist`의
절대 경로, `UPLOAD_DIR`은 릴리스 외부의 영구 경로로 지정합니다.
`NODE_ENV=production`에서 HTTPS Secure 세션을 사용합니다.

[systemd 예제](../deploy/deuce.service)는 `/opt/deuce/current`, `/opt/deuce/node/bin/node`,
`/etc/deuce/deuce.env`, `/var/lib/deuce`를 가정합니다. 설치 경로에 맞춰 수정하세요.
[Cloudflare Tunnel 예제](../deploy/cloudflared-deuce.yml)는 선택 사항입니다. 터널 ID·자격증명·
호스트를 자신의 것으로 바꿉니다. 저장소 예제를 그대로 운영 설정 위에 덮어쓰지 마세요.

기동 후 `/health` 정상 응답과 미로그인 `/auth/me`의 401을 확인합니다. 허용한 두 계정으로
로그인해 메시지·첨부를 주고받고 새로고침 후 유지되는지 확인합니다.

## 자체 서버용 데스크톱 앱

공식 앱은 공식 서버에 연결됩니다. 다른 서버용 앱은 주소를 지정해 빌드합니다.
현재 앱 안에서 서버를 바꾸는 화면은 없습니다.
기본 제품명과 앱 ID도 공식 앱과 같으므로 별도 서버용 앱을 공식 앱과 동시에 설치하는
구성은 아직 제공하지 않습니다. 이를 배포하려면 제품명·앱 ID와 사용자 데이터 경로도 분리해야 합니다.

1. 자신의 Google **데스크톱 앱** OAuth 클라이언트 JSON을 내려받습니다.
2. `python3 scripts/configure-desktop-oauth.py /path/to/downloaded-client.json`으로 가져옵니다.
   파일은 Git에서 제외됩니다. 서버의 `GOOGLE_DESKTOP_CLIENT_ID`를 같은 클라이언트 ID로 설정합니다.
3. `DEUCE_APP_ORIGIN`에 경로 없는 HTTPS 원점을 지정합니다.

```bash
DEUCE_APP_ORIGIN=https://chat.example.com pnpm --filter @deuce/desktop dev
# Windows 또는 electron-builder가 지원하는 교차 빌드 환경
DEUCE_APP_ORIGIN=https://chat.example.com pnpm --filter @deuce/desktop package:win
# Mac 배포에는 자신의 Developer ID 인증서와 notarytool 키체인 프로필 필요
DEUCE_APP_ORIGIN=https://chat.example.com DEUCE_NOTARY_PROFILE=YOUR_NOTARY_PROFILE pnpm --filter @deuce/desktop package:mac
```

PowerShell에서는 먼저 `$env:DEUCE_APP_ORIGIN = 'https://chat.example.com'`으로 설정합니다.
Mac 인증서는 electron-builder가 선택하며 여러 개라면 `CSC_NAME`으로 지정합니다.
현재 Windows 설정에는 서명이 없어 OS 경고가 나타날 수 있습니다. 운영자가 자신의
서명 설정을 추가해야 합니다. Mac 패키징은 공증 프로필 없이 완료되지 않습니다.

서버 주소는 앱에 빌드 시 고정됩니다. 패키징은 `dist/build-config.json`에서 같은 서버의
`/downloads/` 피드를 읽습니다. 로그인·탐색 허용·CSP·재연결도 같은 서버를 사용합니다.
electron-builder를 직접 호출할 때는 **`--config build/package.cjs`**가 필요합니다.
다른 서버의 업데이트 피드가 섞이면 패키징을 거부합니다.

업데이트를 제공하려면 새 버전의 `latest*.yml`과 참조하는 설치 파일·ZIP·blockmap을
자신의 `DESKTOP_DOWNLOAD_DIR`에 함께 배치합니다. 아키텍처별 파일과 SHA512를 확인하고
같은 서명 주체를 유지합니다. 해당 환경 변수가 없으면 다운로드 서비스를 제공하지 않습니다.
현재 Windows·Intel Mac의 실제 버전 간 업데이트 검증은 완료되지 않았습니다.

Desktop OAuth는 공개 클라이언트이며 JSON 값은 앱에 포함됩니다. 웹 OAuth 비밀키,
세션 키, 사용자 MCP 키를 앱에 넣어서는 안 됩니다.

## 백업과 변경

### AI 기능 제거 버전으로 업그레이드 (#18)

이 변경은 아직 운영에 배포하지 않았습니다. 적용할 때 DB·첨부·설정을 백업하고 **기존 서버를 중지한 뒤**
`prisma migrate deploy`로 `20260911080000_retire_ai_feature`를 적용합니다. 실행 중 요청은
`FAILED / FEATURE_REMOVED`로 종료하고, 연결 키를 회수하며 기본 AI 설정을 비웁니다.
작성자·메시지·방 권한·완료된 실행 기록은 보존합니다. 기존 서버가 동시에 실행되면 새 요청을
만들 수 있으므로 서버 중지 순서를 지켜야 합니다.

새 서버·웹과 새 버전의 데스크톱을 함께 배포하고 앱을 재시작합니다. AI API·`/mcp`는 404,
`/agent-runner`는 연결 거부가 정상입니다. 사람 로그인·메시지·멘션과 과거 AI 답변을 확인합니다.
구버전 앱에는 버튼이 남을 수 있지만 새 서버에서 실행할 수 없습니다. PC의 과거 암호화 연결 파일은
자동 삭제하지 않으며 새 앱에서 읽거나 복구하지 않습니다.

이전 바이너리로 되돌려도 회수한 키는 복구되지 않습니다. 키를 자동 재활성화하지 말고,
배포 전 백업과 배포 후 사람 대화 보존을 고려해 별도 복구 절차를 결정합니다.

DB·첨부·환경 설정을 비공개 보관하고 별도 DB에 복원해 확인합니다. 환경 설정에는
자격증명이 있으므로 백업도 접근을 제한합니다. 업데이트 전 백업과 이전 릴리스를 보존하고
스키마 변경을 되돌릴 수 있는지 확인합니다.

GCS를 쓴다면 [백업 스크립트](../deploy/deuce-backup.sh)와 timer를 참고합니다.
`/etc/deuce/backup.env`에 [예제](../deploy/backup.env.example)의 `DEUCE_BACKUP_BUCKET`을 설정하고
VM 계정에 해당 비공개 버킷의 필요한 권한만 줍니다. 스크립트의 DB·경로와
`DEPLOYMENT.json`도 자신의 배포 방식에 맞게 준비합니다. 예제 변경은 기존 운영 VM에
자동 반영되지 않습니다.

공식 참고: [Google 데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[electron-builder v26 배포 설정](https://www.electron.build/v26/docs/publish/).

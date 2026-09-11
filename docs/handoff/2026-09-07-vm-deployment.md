# 듀스 VM 웹 테스트 배포

## 운영 위치

| 항목 | 값 |
|---|---|
| 접속 주소 | https://deuce.goldenlabs.dev |
| 프로젝트 / VM / 존 | YOUR_GCP_PROJECT / YOUR_VM / asia-northeast3-a |
| 앱 / 터널 | deuce.service / cloudflared-deuce.service |
| 내부 포트 | 127.0.0.1:4010 |
| 런타임 | /opt/deuce/node (Node 24.20.0), pnpm 11.24.0 |
| 릴리스 | /opt/deuce/releases/20260911-02 |
| 현재 링크 | /opt/deuce/current |
| 비밀 설정 | /etc/deuce/deuce.env (root 전용 0600) |
| PostgreSQL | 기존 17.10, DB deuce, 역할 deuce |
| 첨부 | /var/lib/deuce/uploads (deuce 전용) |
| 터널 설정 | /etc/cloudflared/deuce.yml |
| 터널 | deuce-gcp / 2e3e4f68-987f-42d1-a645-33e6c3779435 |
| 백업 | gs://YOUR_PRIVATE_BACKUP_BUCKET |

## 현재 검증과 남은 작업

- 최신 `20260911-02` / 데스크톱 `0.2.4`: AI 제어 UI·API·MCP·PC 실행기를 제거하고 메시지 액션 바를 말풍선 위에 배치. 운영 백업과 복제 DB 검증 뒤 migration을 적용해 메시지 95개와 연결 기록 7개를 보존하고 활성 연결·기본 AI만 해제했다. 총 244개 테스트, Mac 두 아키텍처 서명·공증, 공개 파일 58개 전체 해시와 설치 Mac 업데이트를 확인. [배포 결과](2026-09-11-ai-retirement-release.md).

- 이전 `20260911-01` / 데스크톱 `0.2.3`: 멘션 이름 표시·키보드 선택을 웹·Mac arm64/x64·Windows x64와 두 업데이트 피드에 배포. VM 격리 DB 서버 94개 포함 총 279개 테스트·타입 검사·빌드와 Chromium 검증 통과. [배포 결과](2026-09-11-mention-release.md).

- 이전 `20260910-02` / 데스크톱 `0.2.2`: Microsoft Fluent Emoji 3D 메시지 반응 40종을 웹·Mac arm64/x64·Windows x64와 두 업데이트 피드에 함께 배포. 백엔드·DB 변경 없이 VM 격리 DB 서버 94개·웹 159개·데스크톱 15개와 전체 타입 검사·빌드, 공개 웹 자산·설치 파일 해시 및 Mac 서명·공증 검증 통과. [배포 결과](2026-09-10-fluent-emoji.md).

- 이전 `20260910-01`: Mac Dock·Windows 작업 표시줄 안 읽은 글 배지 웹·0.2.1 앱 배포. 백엔드·DB 변경 없이 VM 격리 DB 서버 94개, 전체 276개 테스트와 Mac 두 아키텍처 서명/공증·패키지/공개 다운로드 검증 통과. [배포 결과](2026-09-10-dock-badge.md).

- 이전 `20260908-03`: 개인 AI 초대·PC 실행기와 채팅 UI, 0.2.0 앱 배포. migration 4→8 기존 데이터 보존, VM 서버 94개와 실제 Mac 업데이트·AI 답변/복구 통과. [배포 결과](2026-09-08-ai-invite-release.md).

- 이전 `20260908-02`: 공식 Desktop OAuth·Google sub 계정 연결·앱 다운로드 반영.
  로컬/VM 서버 각 81개·실제 Mac 로그인·0.1.1 서명/공증/배포 완료.
  상세: `2026-09-08-desktop-native-oauth.md`, `2026-09-08-desktop-receipt.json`.

- 이전 `20260907-04`: 원격 HTTP MCP·사용자 연결 안내 적용. 서버 76개·웹 143개·MCP 2개,
  VM 격리 DB 서버 76개 통과. 공개 `/mcp`에서 두 키로 읽기·검색 검증. DB 변경 없음.
  직전 03으로 코드 복구는 가능하지만 원격 `/mcp`는 사라지므로 연결 사용자의 영향이 있다.

- 이전 `20260907-03`: 채널·AI MCP MVP 적용, 웹 143개·서버 73개·MCP 2개,
  VM 격리 DB 서버 73개 통과. 운영 채널과 Codex/Claude 별도 신원 접속 검증 완료.
  상세: `2026-09-07-channel-agent-mvp.md`. 채널 생성 후 구버전으로 단순 롤백하면
  구버전 웹 스키마가 CHANNEL을 처리하지 못하므로 채널 호환 버전으로 복구해야 한다.

- 후속 릴리스 `20260907-02`: 앱 전체 진단 하네스 적용. 로컬 웹 141개·서버 70개,
  VM 격리 PostgreSQL 17 서버 70개 통과. 이전 `20260907-01`은 롤백용으로 유지한다.
  진단 패널·수집 도구 사용법은 `2026-09-07-diagnostics.md` 참조. 아래는 최초 배포 검증 이력이다.

- 로컬 웹 137개·서버 68개 테스트, 타입 검사·웹 빌드 통과.
- 실제 VM의 Node 24·PostgreSQL 17에서 `deuce_verify_20260907` 격리 DB로 서버 68개 통과.
  테스트 DB는 검증 후 제거했다. 운영 DB와 gate DB에는 테스트를 실행하지 않았다.
- 공개 HTTPS 로그인 화면·health 응답 확인. 리뷰게이트 내부 HTTP 200·기존 서비스 active 확인.
- 공개 페이지·중첩 SPA 200, 미로그인 API 401, 없는 API/`.env` 404, 로그인 리디렉션의
  Secure·HttpOnly·SameSite=Lax 확인. 실제 공개 WebSocket은 미로그인에 unauthorized 반환.
- `20260907T002317Z` 백업을 GCS에서 재다운로드해 해시 4개 검증·별도 DB 복원(테이블 9개)·
  첨부/설정 압축 해제를 확인하고 임시 DB·파일을 제거했다. 해당 초기 복원 검증 시점의 DB·첨부는 빈 상태였으므로
  실사용 데이터가 쌓인 뒤 대표 첨부와 메시지 연결을 포함한 복원 검증을 추가한다.
- 초기 `redirect_uri_mismatch`는 감독의 콜백 URI 등록·저장 후 해소됐다.
  2026-09-07 09:35 새 로그인 요청에서 Google 계정 입력 화면 진입 확인.
  이후 감독의 로그인 완료 보고와 운영 DB 사용자 1명 생성, 앱·터널 active를 확인했다.
  감독 브라우저의 채팅 화면을 직접 검사한 것은 아니며 두 사용자 검증은 남아 있다.
- 필요한 URI: `https://deuce.goldenlabs.dev/auth/google/callback`.
  [Deuce OAuth 클라이언트](https://console.cloud.google.com/auth/clients?project=YOUR_OAUTH_PROJECT)의
  `Deuce Local`에서 **기존 localhost URI를 유지하고 추가**한다.
- 감독이 지정한 추가 계정 3개를 운영 `ALLOWED_EMAILS`에 등록했다(총 4개). 사용자 이메일은
  운영 비밀 설정에서 관리한다. 로그인해야 User가 생성되어 대화 상대 목록에 나타난다.
- 기존 안내 정정: 현재 요청 범위는 `openid email profile`뿐이므로 Google 테스트 사용자
  목록 등록은 필수가 아니다. 서버 허용목록은 계속 적용한다. 민감 범위를 추가하면 재검토한다.
  근거: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- 두 실계정 브라우저 검증·Electron·임베드·GCS 첨부 드라이버는 아직 미완료다.

## 접속·상태·로그

SSH는 IAP만 허용된다. 공인 IP의 22번 직접 접속은 타임아웃이다.

```bash
gcloud compute ssh YOUR_VM --project=YOUR_GCP_PROJECT --zone=asia-northeast3-a --tunnel-through-iap
sudo systemctl status deuce cloudflared-deuce deuce-backup.timer
sudo journalctl -u deuce -n 50 --no-pager
sudo systemctl show deuce-backup.service -p Result
curl -fsS http://127.0.0.1:4010/health
```

비밀 설정·쿠키·OAuth code를 로그나 대화에 출력하지 않는다. 인증 설정을 바꾸면
`sudo systemctl restart deuce`로 반영한다. 리뷰게이트 서비스는 재시작할 필요가 없다.

## 백업·복원

매일 04:00 KST 이후 최대 5분 지연으로 `deuce-backup.timer`가 실행된다. GCS의 시각별
디렉터리에 `deuce.dump`, `uploads.tar.gz`, `config.tar.gz`, `DEPLOYMENT.json`을 올리고
`SHA256SUMS`를 마지막에 올린다. manifest가 없는 디렉터리는 미완료 백업이다.
설정 백업에 비밀이 포함되므로 버킷은 uniform IAM·public access prevention을 적용했다.
VM 서비스 계정에는 이 버킷의 objectCreator·objectViewer만 부여했다. 백업은 30일 후
수명주기로 삭제하며 soft delete는 7일이다. 수동 실행은 `sudo systemctl start deuce-backup`.

복원은 GCS 백업을 0700 임시 디렉터리에 다운로드하고 `sha256sum -c SHA256SUMS`를
먼저 통과시킨다. `pg_restore --exit-on-error --no-owner --no-acl`로 **새 DB**에 복원한 뒤
메시지·첨부를 확인한다. 운영 교체 시 앱을 정지하고 DB 소유자와 역할 권한을 맞추고,
첨부를 `/var/lib/deuce/uploads`에 deuce 소유권으로 복구한다. 설정 백업의 DB 비밀번호는
복원 DB 로그인 역할과 맞춰야 한다. 기존 gate DB에는 복원 명령을 실행하지 않는다.

## 재배포·복구 경계

- `deploy/`의 systemd·터널·환경 예제가 운영 구성 원본이다.
- 웹 빌드와 검증을 로컬에서 마치고 새 `/opt/deuce/releases/<id>`에 소스·잠금 파일·
  `apps/web/dist`를 전송한다. `.env`, uploads, node_modules, .git은 전송하지 않는다.
- Linux에서 고정 pnpm으로 `install --frozen-lockfile`, 서버 디렉터리에서
  `prisma generate`를 실행한다. 비밀은 `/etc/deuce/deuce.env`에서 프로세스 환경으로만 읽는다.
- `prisma migrate deploy`는 새 스키마의 이전 버전 호환 여부를 확인한 뒤 실행한다.
- 릴리스 코드는 root 소유·deuce 읽기 전용으로 유지한다. `current`를 새 릴리스로 교체하고
  deuce 서비스만 재시작한다. 공개 HTTP·인증·소켓과 기존 리뷰게이트 상태를 확인한다.
- 코드 롤백은 이전 `current` 복구 후 deuce 재시작이다. DB 마이그레이션은 자동으로
  되돌아가지 않으므로 데이터 변경이 있으면 별도 복구 판단이 필요하다.
- 초기 배포는 커밋하지 않은 작업 브랜치에서 만들었다. `DEPLOYMENT.json`에 기반 커밋과
  파일별 SHA-256을 기록한다. 커밋·push는 실행하지 않았다.

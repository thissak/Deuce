# 공개 개발 준비 — 2026-09-08

이번 작업은 공개할 소스와 기여 환경을 준비했다. GitHub 저장소는 아직 **PRIVATE**이며
커밋·push·PR·공개 전환이나 운영 배포를 수행하지 않았다. 기존 미커밋 작업을 보존했다.

## 준비한 내용

- Apache-2.0, 외부 의존성 고지, README, 기여/보안 안내, 이슈/PR 템플릿
- Google 자격증명 없이 실행되는 자동 테스트와 소스 빌드, 로컬 실행/실제 로그인 가이드
- 웹/API 동시 실행, MCP 개발 프록시, 고정 loopback/5173 설정
- 자체 서버용 데스크톱 원점과 동일 서버 업데이트 피드, 운영자 자신의 OAuth/서명 사용
- GitHub 호스팅 러너의 Node 24/26·PostgreSQL 16 CI, 고정 Action 커밋·읽기 권한·비밀정보 검사
- 운영 예제를 운영자별 설정으로 전환, 운영 증빙/키 제외와 원본의 로컬 보존

기존 VM은 초대형 테스트 인스턴스로 유지한다. VM·IAM·결제·DB·설치된 백업 스크립트·
배포된 앱 0.1.2는 이번 준비 작업으로 바뀌지 않았다.

## 검증

| 검증 | 결과 |
|---|---|
| Mac Node 26.3.1 | 서버 81·웹 143·MCP 2·데스크톱 6 = 232개 통과 |
| Linux Node 24.20.0, PostgreSQL 16.14 | 개인 `.env`·Google JSON·기존 node_modules 없이 frozen 설치, 동일 232개 통과 |
| 타입 검사·웹/MCP/데스크톱 소스 빌드 | 두 환경 모두 통과 |
| 신규 개발 DB migration | 초기화부터 기존 migration 4개 적용 통과 |
| 개발 실행 | 서버 `/health` 200, 웹 200, 미인증 `/auth/me`·`/mcp` 401 |
| MCP 개발 프록시 | 공식 SDK로 `localhost:5173/mcp` 연결·도구 5개·가짜 채널 읽기 통과 |
| 자체 주소 시험 패키지 | `chat.example.com` 원점이 ASAR에 포함되고 app-update.yml 피드가 동일 서버임을 확인 |
| 패키지 고지 | Apache LICENSE 원문과 THIRD_PARTY_NOTICES 포함 확인 |
| 잘못된 피드 | 실제 electron-builder에 다른 피드를 지정하면 beforePack에서 거부 |
| GitHub workflow | actionlint 1.7.12 통과. GitHub에서의 실제 실행은 아직 아님 |
| 비밀정보 | Gitleaks 8.30.1 기본 규칙+Deuce 키 규칙으로 Git 이력과 공개 후보 검사, 발견 0건 |
| 기타 | 문서 링크·Python CLI 도움말·백업 shell 문법·`git diff --check` 통과 |

Linux 첫 실행 검증에서 Vite가 IPv6 localhost에만 바인딩돼 Node MCP 클라이언트의
IPv4 연결이 거부됐다. 명시적인 loopback과 고정 포트로 수정한 뒤 HTTP·실제 MCP
프록시를 재검증했다. Google 실로그인은 새 자격증명으로 반복하지 않았으며 자동 테스트는
모의 응답이다. 시험 패키지는 Linux의 `--dir` 산출물로, Mac/Windows 서명 배포나 Linux 앱
지원 릴리스를 뜻하지 않는다. 기존 Windows·Intel Mac 업데이트 실기 검증도 남아 있다.

## 공개 파일과 비공개 원본

공개 후보는 `git ls-files --cached --others --exclude-standard` 기준으로 만들었다.
환경 파일·Google JSON·MCP 키·배포 결과물·업로드·로그·로컬 receipt·`.private`는 제외한다.
추적 파일 중 ignore 규칙에 걸리는 파일이 없음을 확인했다.

로컬 검토용 산출물:

- `.private/oss-preparation/deuce-public-candidate.zip`: Git 이력 없는 소스 후보
- `.private/oss-preparation/public-candidate.sha256`: 압축본 해시
- `.private/oss-preparation/public-candidate-manifest.json`: 파일별 해시
- `.private/oss-preparation/originals/`: 예시로 바꾸기 전 운영자 문서
- `.private/oss-preparation/verification/`: 실행 로그와 비식별 검사 결과

자동 검사는 모든 정보 노출을 보증하지 않는다. 현재 문서에서 개인 식별자를 제거해도
과거 커밋은 남는다. 현재 커밋 이력의 `AGENTS.md`, `docs/PROGRESS.md`,
`docs/handoff/2026-09-05-browser-verification-claude.md`에는 개인 경로·이메일·운영 프로젝트명
기록이 있고 작성자/커미터 이메일도 포함된다. 인증키는 검사에서 발견되지 않았다.

## 다음 공개 단계

1. 공개할 코드와 Apache-2.0 적용 범위를 검토하고 현재 미커밋 변경을 정리한다.
2. 과거 운영 기록 노출을 피하려면 준비된 소스를 새 이력의 저장소에 공개한다.
   기존 저장소의 이력을 유지해 공개하려면 위 과거 기록까지 공개된다는 점을 검토한다.
   이번 작업에서는 원본 이력을 재작성하지 않았다.
3. GitHub에서 실제 CI를 실행하고 PR 보호 규칙·기여 경로를 확인한다.
4. 공개 전환 시 비공개 취약점 제보 기능을 활성화하고 README/SECURITY의 준비 중 문구를 갱신한다.

공개 코드 기여에 운영 VM 권한이나 운영 계정·데이터를 제공할 필요는 없다.

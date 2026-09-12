# Deuce · 듀스

**채널에서 대화하고 자료를 공유하는 오픈소스 메신저.**
Teams·Slack에서 참고한 채팅 경험을 제공합니다. AI 참여 기능은 기존 코드를 제거하고 사용 흐름부터 다시 설계합니다.
현재 공개 개발 중인 초기 버전이며 영상통화는 범위에서 제외합니다.

## 지금 할 수 있는 것

- 1:1·그룹·채널 채팅, 실시간 수신, 인용 답장·수정·삭제·반응·고정
- 파일 첨부·공유 목록, 검색, 멘션·활동, 읽음 상태·프레즌스·알림
- 웹 앱, Mac·Windows 앱, 버전 확인과 사용자 선택에 따른 다운로드·설치
- 서버와 브라우저를 연결해 보는 선택적 진단 로그

AI 초대·PC 실행기·MCP는 #18로 제거했고 웹 `20260911-02`·데스크톱 `0.2.4`에 배포했습니다.
요청 없는 AI 자동 감시, 자료 OCR/색인, 서버 간 연합, 영상통화는 아직 없습니다.
Mac arm64의 실제 업데이트는 확인했고 Windows·Intel Mac 업데이트 실기 검증은 남아 있습니다.

## 시작하기

| 목적 | 안내 |
|---|---|
| 실행하고 기여하기 | [로컬 개발](docs/getting-started.md) · [기여 안내](CONTRIBUTING.md) |
| 내 서버 운영하기 | [서버 설치와 앱 제작](docs/self-hosting.md) |
| AI 재설계 검토 | [새 계획](docs/design/2026-09-11-ai-restart-plan.md) · [기존 기능 상태](docs/ai-connections.md) |
| 완료/미완료 확인 | [진행 상태](docs/PROGRESS.md) · [변경 이력](docs/CHANGELOG.md) |
| 문제·아이디어 제안 | [GitHub Issues](https://github.com/thissak/Deuce/issues) |
| 보안 제보 | [보안 안내](SECURITY.md) |

Node 24/26, pnpm 11.24.0, PostgreSQL 16을 사용합니다. 자동 테스트와 소스 빌드는
Google 자격증명이나 운영자의 GCP 권한 없이 실행됩니다. 실제 로그인에는 자신의 Google OAuth가 필요합니다.

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm --filter @deuce/server exec prisma generate
pnpm --filter @deuce/server db:migrate:test
pnpm test
pnpm typecheck
pnpm build
```

설치 도구 준비·웹 실행·로그인은 [로컬 개발 가이드](docs/getting-started.md)를 따릅니다.

## 코드와 운영 서버

`deuce.goldenlabs.dev`는 유지관리자의 초대형 테스트 인스턴스입니다. 소스 공개 후에도
VM·비용·운영 데이터·사용자 초대는 운영자가 관리합니다. 외부 기여자는 자신의 로컬 환경이나
자체 서버를 사용하며 운영 서버 접근 권한을 받지 않습니다.

자체 서버 비용은 해당 운영자가 부담합니다. 서로 채팅하려는 사람들은 같은 서버를 사용합니다.
CI는 GitHub 호스팅 러너에서 코드를 검증하며 운영 VM에 자동 배포하지 않습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `apps/server` | Fastify API·Google 로그인·Socket.IO, Prisma/PostgreSQL |
| `apps/web` | React/Vite 웹 앱 |
| `apps/desktop` | Electron 앱·기본 브라우저 로그인·업데이트 |
| `packages/shared` | 클라이언트·서버 타입/스키마 계약 |
| `deploy` | 자체 운영에 맞게 수정해서 쓰는 예제 |

## 라이선스

Deuce 소스 코드와 문서는 [Apache License 2.0](LICENSE)을 따릅니다.
외부 라이브러리·런타임의 라이선스와 고지는 별도로 유지합니다.
[외부 의존성 안내](THIRD_PARTY_NOTICES.md)를 참고하세요.

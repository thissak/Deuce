# Mac·Windows 안 읽은 글 배지 — 0.2.1 배포

## 완료된 작업

- Mac Dock·Windows 작업 표시줄에 전체 대화의 `unreadCount` 합계를 표시한다. 음소거 방도 대화 목록과 동일하게 포함하며, 서버 기준으로 본인 글·삭제 글은 제외한다. 합계가 0이면 제거한다. Windows의 작은 오버레이는 100개 이상을 `99+`로 표시하며 접근성 설명에는 전체 숫자를 유지한다.
- `DesktopBadge`가 기존 React Query 대화 목록을 구독한다. 새 카운터·폴링·별도 소켓은 없다. 활동 화면에서도 구독을 유지하므로 새 글·읽음·삭제·탈퇴·재접속을 반영한다.
- preload의 좁은 `setUnreadCount` IPC를 추가하고 메인 창/프레임·신뢰 원점·0 이상의 안전한 정수만 받는다. 로그인 화면·전체 탐색·renderer 종료 때 배지를 제거한다.
- 데스크톱에서는 숨김뿐 아니라 포커스 상실도 읽음 전진을 막는다. 포커스 복귀 시 기존 읽음 API를 사용한다.
- 웹 159·데스크톱 15·MCP 2·실행기 6개, VM의 새 격리 DB에서 서버 94개(총 276개) 테스트와 `pnpm typecheck`, `pnpm build`, `git diff --check` 통과. 테스트 DB는 검증 후 제거했다.
- `pnpm --filter @deuce/desktop exec electron ../../scripts/desktop-badge-smoke.cjs` 통과: 격리 세션과 합성 페이지로 실제 preload IPC→Dock `3→12→빈 값`, `7→전체 탐색→빈 값` 확인. 운영 세션/서버는 사용하지 않았다.
- 동일 smoke에서 Windows용 `3/12/99/99+` 오버레이의 실제 NativeImage 생성·16px 크기·100 이상 이미지 동일성을 검증하고 PNG 외관을 확인했다. Windows IPC 분기는 단위 테스트로 검증했다.

## 배포 결과

- 운영 웹 릴리스 `20260910-01`과 Mac arm64/x64·Windows x64 **0.2.1**을 [다운로드](https://deuce.goldenlabs.dev/download) 및 두 업데이트 피드로 공개했다. 새 배포 파일 14개를 검증했다.
- Mac 두 앱의 Developer ID 서명·Apple 공증·staple·Gatekeeper 통과. 세 패키지의 버전과 `main.cjs`·`preload.cjs`가 검증한 빌드와 정확히 일치한다.
- 피드가 참조하는 5개 파일의 SHA-512·크기를 대조했다. 공개 작은 파일은 전체 SHA-256, 큰 파일은 Range 206·전체 크기·앞부분 바이트를 확인했다.
- 공개 Windows 설치 파일 114,136,420바이트와 Mac arm64 업데이트 ZIP 131,554,370바이트를 각각 전체 다운로드해 SHA-512 일치를 확인했다.
- 운영 백업 성공 후 current를 전환했다. 서버·MCP·공용 계약·잠금 파일은 이전 배포와 해시가 같으며 운영 DB 변경은 없다. 공개 health·JS/CSS 정확한 바이트 일치·미로그인 API/MCP 401·환경 파일 404·다른 서비스 정상 확인.
- 이전 웹 `20260908-03`, 다운로드 `0.2.0`을 보존했다. 기존 버전 파일도 새 다운로드 경로에서 계속 제공해 이미 진행 중인 다운로드를 유지한다.
- 배포는 미커밋 소스 스냅샷이며 원본 커밋과 파일 해시는 VM `DEPLOYMENT.json`에 기록했다. 추가 증빙은 로컬 `.private/dock-badge-release/`, VM `VERIFICATION.json`·`ACTIVATION.json`에 있다. 별도 Codex 대화 유지 계획 WIP는 배포에 포함하지 않았다.

## 다음 작업

- 기존 앱의 Deuce → 업데이트 확인 → 다운로드 → 재시작하고 설치로 갱신한다. 사용자 앱의 강제 재시작·교체는 하지 않았다.
- 설치 앱의 실제 0.2.0→0.2.1 업데이트·두 계정 수신→읽음→로그아웃 및 Dock/Windows 작업 표시줄 외관을 확인한다. native smoke·패키지 검증과 실제 설치 앱의 수신/업데이트 검증은 구분한다.

## 동작 조건

- 감독의 추가 요청으로 Windows 배지를 포함했다. [Electron 작업 표시줄 API](https://www.electronjs.org/docs/latest/api/browser-window#winsetoverlayiconoverlay-description-windows)를 사용하며, 실제 Windows 기기 검증은 남았다.
- 앱 창을 숨겨도 프로세스가 실행 중이면 갱신한다. 앱을 완전히 종료한 동안의 푸시는 이번 범위가 아니다.
- [Electron Dock 공식 문서](https://www.electronjs.org/docs/latest/api/dock#docksetbadgetext-macos)에 따라 macOS 알림 권한이 필요하다. 설치 앱에서 배지가 보이지 않으면 시스템 설정의 Deuce 알림·앱 아이콘 배지 설정을 확인한다.

## 핵심 결정 사항

기존 React Query·서버 읽음 계약과 Electron 기본 Dock/작업 표시줄 API를 사용한다. Windows 이미지는 작은 비트맵 숫자를 NativeImage로 만들며 별도 카운트 상태나 새 의존성이 없어 추가 ADR은 만들지 않았다.

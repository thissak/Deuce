# ADR 001: TypeScript 풀스택 모노레포 + Electron 데스크톱

- 상태: Accepted (2026-08-29)

## 맥락

Deuce v1은 골든랩 내부용(동시 수십 명 이하) Teams식 채팅으로, Windows·Mac
데스크톱 앱과 웹 브라우저 접속을 모두 제공해야 한다. 기술 스택 후보로
(A) TypeScript 풀스택, (B) Go 서버 + React, (C) Mattermost 배포를 비교했다.

## 결정

**A. TypeScript 풀스택 모노레포**를 채택한다.

- 서버: Node.js + Fastify + Socket.IO + Prisma + PostgreSQL
- 클라이언트: React + Vite + react-query, 실시간은 Socket.IO 클라이언트
- 데스크톱: 같은 SPA를 Electron 셸로 패키징 (electron-builder/updater)
- 공유: zod 스키마·타입을 `packages/shared`로 서버·클라 공유

실시간 동기화·재접속·룸 관리는 Socket.IO가 이미 해결한 문제이므로
손코딩하지 않는다 (글로벌 STOP 신호어 규칙 준수).

데스크톱 셸은 Tauri 대비 **Electron**을 택한다: Slack·Teams·VS Code가
검증한 경로로 알림·트레이·자동 업데이트가 성숙하고, Chromium 내장이라
Windows·Mac 렌더링이 동일하다. 내부 도구에는 경량성보다 성숙도가 우선이다.

## 기각된 대안

- **B. Go 서버 + React**: 성능은 최상급이나 수십 명 규모에서 이점이 없고,
  언어가 갈라져 타입 공유가 사라진다.
- **C. Mattermost 배포**: 내부 채팅 용도만 보면 가장 싸지만, 이 프로젝트의
  목적은 Teams 같은 앱을 직접 만드는 것이므로 목적에 맞지 않는다.

## 결과

- 단일 언어로 클라·서버·임베드를 하나의 코드베이스에서 관리한다.
- 웹 기술 기반이므로 웹 접속과 프로젝트 사이트 임베드(ADR 002)가 추가
  비용 없이 열린다.
- Electron 산출물 용량·메모리 오버헤드는 내부용 트레이드오프로 수용한다.

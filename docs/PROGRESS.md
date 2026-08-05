---
lifecycle: active
---

# Deuce 진행 상태

## Bootstrap

- [x] 내부 협업 도구의 이름과 목적 확정
- [x] 독립 워크스페이스와 `main` Git 저장소 생성
- [x] Claude 문서 SSOT와 Codex 중개 구조 생성
- [x] GOLEM 카탈로그 등록
- [x] 비공개 GitHub 저장소 `thissak/Deuce` 생성 및 origin 연결
- [x] 이미지·영상·일반 파일의 원본 저장소를 비공개 Cloudflare R2로 확정 ([ADR 001](adr/001-r2-object-storage.md))
- [x] PC·Android·iPhone용 설치형 협업 앱을 클라이언트 범위로 확정
- [x] R2 인프라 연결 계약 문서화 ([R2 연결](infrastructure/r2-connection.md))
- [x] Flutter 공통 클라이언트와 플랫폼 작업 분리 확정 ([ADR 002](adr/002-flutter-client-platform-split.md))
- [x] Mac Pro iOS 작업 handoff 작성 ([iOS handoff](handoff/ios-client-macpro-handoff.md))
- [ ] 초기 사용자 흐름과 MVP 범위 확정
- [x] 첫 슬라이스 기술 스택과 Windows 실행 환경 확정
- [x] 성숙한 오픈소스 prior art를 바탕으로 협업 코어 설계 정리 ([설계 문서](specs/collaboration-core-design.md))
- [ ] 사람과 에이전트가 함께 사용하는 첫 작업방 구현

## 첫 메시지 버티컬 슬라이스

- [x] Windows Flutter 클라이언트 구현과 릴리스 빌드
- [x] TypeScript 서버와 PostgreSQL 메시지 저장
- [x] Flutter 클라이언트 2개의 실시간 메시지 자동 관통 검증
- [x] 연결 종료와 서버 재시작 후 누락 메시지 자동 복구 검증
- [x] 두 Windows 네이티브 앱 창의 수동 인수 확인 ([실행 방법](development/local-first-slice.md))
- [ ] Android 클라이언트 연결 (Windows 슬라이스 이후)
- [ ] iPhone 클라이언트 연결 (Mac Pro handoff 작업)

현재 구현은 `alice`·`bob` 개발 fixture와 `general` 단일 채널만 제공한다. 실제 인증 전
서버는 `127.0.0.1`에만 바인딩하며 공개 인터넷에 노출하지 않는다.

## 제품 목표

- 사용자 10명 이하의 골든랩 내부 도구로 바로 사용한다.
- Teams와 Slack을 참고한 PC·Android·iPhone용 설치형 협업 앱으로 제공한다.
- 대화와 자료 공유가 쉽고, 사람과 에이전트가 같은 데이터를 보며 작업한다.

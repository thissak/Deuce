# Changelog

### 2026-08-06

- [docs] Mattermost·Zulip·Matrix·FluffyChat·Rocket.Chat의 검증된 패턴을 협업 코어 설계로 정리 — 현재 Socket.IO·PostgreSQL·R2 방향을 유지하고 미결정 기술과 후속 검증 항목을 분리
- [test] 두 Windows 네이티브 앱 창의 수동 송수신 확인 — Alice와 Bob이 같은 채널에서 실시간 메시지를 주고받는 첫 슬라이스 인수 완료
- [feat] 메시지 작성 단축키 추가 — Enter로 전송하고 Shift+Enter로 줄바꿈하는 데스크톱 채팅 입력 동작 제공
- [fix] 재접속 복구 기준을 마지막 성공 순번으로 유지 — 누락 조회 실패 뒤 들어온 실시간 이벤트가 중간 메시지를 영구히 건너뛰지 않도록 수정
- [fix] 자동 관통 테스트 후 PowerShell 환경 복원 — 후속 개발 서버가 테스트 DB를 잘못 사용하지 않도록 호출 전 값을 보존
- [test] PostgreSQL·Socket.IO 서버 통합 테스트와 Flutter 두 클라이언트 관통 테스트 추가 — 저장 후 방송, 중복 방지, 누락 복구와 서버 재시작 보존 검증
- [feat] Windows 첫 메시지 버티컬 슬라이스 구현 — Flutter 채널 UI, TypeScript 실시간 서버, PostgreSQL 영구 저장과 재접속 복구 연결
- [docs] 로컬 실행·자동 검증·현재 보안 경계 문서화 — 인증 전 loopback 전용 원칙과 두 Windows 창 수동 확인 절차 명시
- [docs] 메시지 계약 v1 고정 — HTTP 누락 조회, Socket.IO 전송·방송·중복 방지 규칙을 플랫폼 handoff의 공통 기준으로 명시
- [docs] 첫 버티컬 슬라이스를 Windows 우선으로 분리하고 Mac Pro iOS handoff 작성 — Xcode 작업을 별도 환경에 격리하면서 Flutter 공통 계약을 유지
- [docs] PC·Android·iPhone용 설치형 협업 앱과 R2 연결 계약을 문서화 — Cloudflare 범위를 원본 파일 저장소로 한정하고 웹사이트 인프라 가정을 제거
- [docs] 이미지·영상·일반 파일의 원본 저장소를 비공개 Cloudflare R2로 확정 — 맥미니의 제한된 용량과 대용량 파일 중계 부담을 분리
- [feat] Deuce 프로젝트 부트스트랩 — 사람과 에이전트가 같은 대화·자료·작업 맥락을 공유하는 골든랩 내부 협업 도구로 정의
- [chore] 독립 워크스페이스와 문서 SSOT를 생성하고 GOLEM 카탈로그에 등록
- [chore] 비공개 GitHub 저장소 `thissak/Deuce`를 생성하고 로컬 origin으로 연결 — 내부 프로젝트의 원격 이력 기반 마련

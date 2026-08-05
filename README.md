# Deuce

10명 이하의 팀이 프로젝트 대화와 자료를 공유하기 위한 설치형 협업 앱이다. Teams와
Slack의 익숙한 채널 UI를 참고하며 Windows·Android·iPhone을 대상으로 한다.

현재 저장소에는 Windows 우선의 첫 메시지 버티컬 슬라이스가 구현되어 있다.

- Flutter 공통 클라이언트와 Windows Runner
- TypeScript, Fastify, Socket.IO 메시지 서버
- PostgreSQL 영구 저장과 재접속 복구
- 단일 개발 채널 `general`과 fixture 사용자 `alice`, `bob`

현재 인증은 개발 fixture일 뿐이다. 서버 기본 바인딩은 `127.0.0.1`이며 실제 인증을
추가하기 전에는 공개 인터넷에 노출하지 않는다.

로컬 실행과 검증 방법은 [첫 메시지 로컬 실행](docs/development/local-first-slice.md)을
따른다. 제품 범위와 현재 상태는 [진행 상태](docs/PROGRESS.md)가 기준이다.

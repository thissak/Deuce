# Fluent 3D 메시지 반응 40종

## 현재 상태

- 메시지 액션 바의 빠른 반응 4종과 전체 선택기 40종을 Microsoft Fluent Emoji 3D PNG로 표시한다.
- 선택한 반응은 기존과 같은 유니코드 문자열로 서버에 전송하므로 기존 API·DB·실시간 이벤트와 호환된다.
- 메시지 반응 칩과 활동 피드도 같은 3D 자산을 사용한다. 현재 40종에 없는 과거 반응은 유니코드 문자로 표시한다.
- 자산은 `microsoft/fluentui-emoji` 커밋 `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`에서 가져왔다.
  MIT 원문은 `apps/web/public/fluent-emoji/LICENSE`, 외부 고지는 `THIRD_PARTY_NOTICES.md`에 있다.

## 검증

- `pnpm --filter @deuce/web test` — 24파일 159개 통과
- 전체 타입 검사·프로덕션 빌드 — 통과
- 데스크톱 테스트 15개, Windows x64·Mac arm64/x64 프로덕션 패키징 — 통과
- VM의 운영과 분리된 PostgreSQL 17 DB에서 8개 migration·서버 94개 테스트 통과
- 코드 매핑 40개와 배포 PNG 40개의 파일 존재·256×256 RGBA 형식 확인

## 배포 결과

- 운영 웹 릴리스 `20260910-02`로 배포했다. 직전 `20260910-01`과 서버·MCP·공용 계약 파일 해시가 같고 운영 DB 변경은 없다.
- 전환 전 백업 성공 후 `current` 링크를 원자적으로 교체했다. Deuce·터널·기존 서비스 4개가 active이며 공개 health가 정상이다.
- 공개 HTML·JS·CSS와 Fluent PNG 40개·MIT 원문을 로컬 빌드와 바이트 단위로 대조했다. SPA 경로 200, 미인증 API 401, `.env`와 없는 자산 404를 확인했다.
- 릴리스 285개 파일의 해시를 VM `DEPLOYMENT.json`에 기록했고 비공개 GCS 복구본을 재다운로드해 SHA-256 일치를 확인했다. 이전 릴리스는 보존했다.
- 데스크톱 `0.2.2`의 Windows x64, Mac Apple Silicon·Intel 설치 파일과 업데이트 피드를 같은 운영 배포 단위로 공개했다. 다운로드 페이지와 피드 원문·파일 크기·공개 설치 파일 전체 SHA-256을 빌드 결과와 대조했고 이전 `0.2.1` URL도 보존했다.
- Mac 두 아키텍처는 Developer ID 서명·Apple 공증·staple·Gatekeeper·DMG 검증을 통과했다. 공증 요청 ID는 x64 `017470a6-2f54-4375-922b-7936162c1c26`, arm64 `c5b00291-efa3-48ce-aac3-6abf7df6c94e`다.
- 이후 운영 배포는 웹 릴리스와 Windows x64·Mac arm64/x64 앱, 업데이트 피드를 항상 함께 준비·검증·공개한다. 세 대상 중 하나라도 준비되지 않으면 전체 배포를 완료로 기록하지 않는다.

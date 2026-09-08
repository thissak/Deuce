# 데스크톱 공식 Google 로그인 전환·배포 — 2026-09-08

## 완료

- 서버 `20260908-02` 운영 반영. production migration 4개 적용,
  기존 사용자 ID·대화 기록을 유지하며 Google sub를 최초 검증 로그인에서 연결한다.
- Google Desktop app OAuth 클라이언트 설정 적용. 앱은 공식 Google Auth Library의
  PKCE·코드 교환을 사용하고 서버는 verifyIdToken으로 Desktop audience·서명·발급자·만료와
  인증 이메일·허용목록을 검증한다. 자체 승인 폼·승인 코드 저장소는 제거했다.
- 로컬/VM 격리 DB 서버 각 81개, 데스크톱 3개, 타입 검사·esbuild·Chromium 하네스 통과.
- 실제 Google 로그인 후 기존 계정의 세션 발급 확인. 패키징된 Apple Silicon 앱에서도
  auth/me 200·채팅 화면·듀스 요구사항 채널·renderer Node 접근 차단 확인.
- 감독의 로그인 성공 보고. 쿠키 저장 후 디버깅 옵션 없이 정상 재실행,
  이후 서버 인증 GET 200 확인. 디버깅용 프로브 소스는 제거했다.
- `/Applications/Deuce.app`에 **arm64 0.1.1** 설치. 처음 Intel 앱을 실행하여 OS 지원 종료
  안내가 나왔으나 해당 앱을 종료하고 Apple Silicon용으로 교체했다.
- Mac arm64/x64 DMG·ZIP: Developer ID 서명, Apple 공증 Accepted·staple·spctl 검증 통과.
  Windows x64 NSIS 설치 파일 제작. 업데이트 피드가 참조하는 5개 파일 SHA512 일치.
- 다운로드: https://deuce.goldenlabs.dev/download
- 공개 Apple Silicon DMG 전체 다운로드 SHA256 일치. 모든 설치 파일의 HTTP 206·전체 크기·
  샘플 바이트 일치, 피드·블록맵·페이지 전체 SHA256 일치.
- 배포 전후 GCS 백업 성공. deuce·cloudflared-deuce·gatelab·cloudflared 모두 active.
  두 AI MCP 키로 실제 채널 읽기·검색 확인. 채팅 메시지는 테스트로 추가하지 않았다.

## 산출물·복구

- 서버: `/opt/deuce/current` → `/opt/deuce/releases/20260908-02`
- 서버 스냅샷: `gs://YOUR_PRIVATE_BACKUP_BUCKET/releases/deuce-20260908-02.tar.gz`
  (213개 파일, SHA256은 desktop-receipt 참조). 데스크톱 OAuth JSON은 소스 스냅샷에서 제외.
- 설치 파일: `gs://YOUR_PRIVATE_BACKUP_BUCKET/releases/desktop/0.1.1/` (비공개 복구본, 14개).
- 공개 디렉터리: `/var/lib/deuce/downloads` → `/var/lib/deuce/desktop-releases/0.1.1`
- 이전 서버와 0.1.0 복구본은 보존한다. 이전 0.1.0 앱은 자체 승인 방식이므로 사용하지 않는다.
- 서버 rollback은 nullable googleSub 컬럼을 유지한 채 이전 symlink·서비스로 되돌릴 수 있다.
  다만 0.1.1 로그인 endpoint는 새 서버가 필요하다.
- 클라이언트 ID는 서버 `GOOGLE_DESKTOP_CLIENT_ID`와 앱의 공식 `installed` 설정이 일치해야 한다.
  설정 재가져오기: `python3 scripts/configure-desktop-oauth.py <다운로드 JSON 경로>`.
  Web client secret을 앱에 넣지 않는다. 토큰·쿠키·클라이언트 설정 원문은 로그로 출력하지 않는다.
- 증빙: `docs/handoff/2026-09-08-desktop-receipt.json`

## 남은 검증·알려진 제한

- Windows 실제 설치·실행은 Windows 기기에서 미검증. 코드 서명 없는 배포본이다.
- 버전 간 자동 업데이트 다운로드·재시작 설치는 미검증. 이번에는 피드와 파일 무결성만 검증했다.
- 최초 패키징된 Mac 로그인은 한 차례 실패했고 재시도에서 성공했다. 당시 실패 원인은 확정하지
  못했다. 재시도 진단에서 임시로 Google login_hint에 감독 계정을 지정했으며, 이 디버거 변경은
  디스크·배포 파일에 포함하지 않았고 정상 재실행으로 제거했다. 재발 시 단계별 안전한 진단을 추가한다.
- 커밋·push는 요청받지 않아 수행하지 않았다.

# 데스크톱 버전 간 업데이트 검증 — 2026-09-08

## 동작 계약

- 앱은 실행 시, 이후 4시간마다, Deuce 메뉴의 업데이트 확인 선택 시 운영 피드를 조회한다.
- 다운로드와 설치는 각각 사용자가 `다운로드`, `재시작하고 설치`를 선택해야 진행한다.
- `electron-updater` 6.8.9, `autoDownload=false`, `autoInstallOnAppQuit=false`를 유지한다.
- 0.1.2는 업데이트 전달 검증을 위한 패치 버전이다. `dist/main.cjs`, `dist/preload.cjs`는 설치된 0.1.1과 바이트가 동일하다.

## 완료된 검증

1. 설치된 `/Applications/Deuce.app` arm64 0.1.1의 시작 시 확인과 최신 버전 판정 이벤트를 관측했다. 실제 앱 세션의 `/auth/me`는 200이었다.
2. Mac arm64/x64 서명·공증과 Windows x64 NSIS 제작을 완료했다. 로컬 피드 2개가 참조하는 설치 파일 5개의 크기·SHA512를 대조했다.
3. 14개 배포 파일을 비공개 GCS에 보관하고 VM에서 SHA256 검증 후 다운로드 디렉터리를 0.1.2로 전환했다. 서버 코드·DB 변경은 없다.
4. 설치된 Mac 앱의 실제 메뉴로 운영 피드를 조회해 0.1.2 안내 창을 확인했다. 실제 다운로드 버튼을 눌러 130,007,142바이트 ZIP을 받았고, updater 캐시 파일의 SHA512가 배포본과 일치했다.
5. 실제 재시작하고 설치 버튼을 누른 뒤 Squirrel.Mac의 완료 이벤트, 기존 PID 종료, 새 PID 자동 실행을 관측했다. 설치된 0.1.2의 app.asar SHA256과 코드 서명을 확인했다.
6. 새 프로세스는 디버깅 옵션 없이 실행됐다. 로그인한 채팅 목록과 기존 채널이 표시됐고, 다시 메뉴를 누르면 `최신 버전입니다.` 창이 나타났다. 디버거 포트 5496은 종료됐다.
7. 공개 Windows EXE 전체 다운로드 113,114,802바이트·SHA512 일치, 모든 설치 파일의 Range 206·전체 크기·첫 바이트, 작은 피드/블록맵/페이지 전체 SHA256을 확인했다.

## 증빙과 재현

- 기계 판독 결과: `2026-09-08-desktop-update-receipt.json`.
- 로컬 관측·화면: `/tmp/deuce-update-test/`의 `events.jsonl`, `before.json`, `mac-after.json`, `windows-download.json`, PNG 4개.
- `scripts/desktop-update-observer.cjs <port> <jsonl-path>`는 `--inspect-brk=127.0.0.1:<port>`로 실행한 실제 패키징 앱의 첫 프레임에 관측 콜백만 추가한다. 업데이트 피드·다운로드·대화상자·설치 메서드를 대체하지 않는다.
- 스크립트는 관측 설정 직후 디버거 연결을 해제한다. 디버거 클라이언트를 계속 연결하면 Electron 종료를 지연시킬 수 있으므로 설치 전에 연결이 남지 않았는지 확인한다.
- 시작 시 확인은 실제 실행으로 검증했다. 4시간 타이머의 실제 경과 시험은 수행하지 않았으며, 설정을 코드에서 확인했다.
- Mac Intel 패키지는 서명·공증·파일 제공을 검증했지만 Intel 기기의 업데이트 설치는 미검증이다.

## Windows 확인 대기

감독이 앱 테스트 채널에 Windows와 Mac에서 테스트 중이라는 글을 각각 남겼다(09:11). 이는 사용자 실행 보고이며 이 환경에서 Windows를 직접 조작한 검증은 아니다.

Windows에는 0.1.2가 배포돼 있다. 실행 중인 0.1.1에서 아래 절차를 요청했으며 결과 회신은 아직 없다.

1. Deuce 메뉴 → 업데이트 확인 → 다운로드.
2. 완료 안내 → 재시작하고 설치. 설치 프로그램 안내가 나오면 완료한다.
3. 앱이 다시 실행되고 로그인·채팅이 유지되는지 확인한다.
4. 다시 업데이트 확인을 눌러 최신 버전 안내를 확인한다.

Windows NSIS 설치 실행 결과를 받기 전에는 전체 플랫폼 업데이트 검증 완료로 처리하지 않는다.

## 배포·복구

- 공개: https://deuce.goldenlabs.dev/download
- VM: `/var/lib/deuce/downloads` → `/var/lib/deuce/desktop-releases/0.1.2`.
- 복구본: `gs://YOUR_PRIVATE_BACKUP_BUCKET/releases/desktop/0.1.2/`.
- 이전 0.1.1 디렉터리·배포 파일을 보존했다. 다운로드 링크는 이전 디렉터리로 되돌릴 수 있으나, 이미 설치된 0.1.2 앱이 자동 다운그레이드되는 것은 아니다.
- [electron-builder v26 업데이트 문서](https://www.electron.build/v26/docs/features/auto-update/), [Electron 네이티브 업데이트 API](https://www.electronjs.org/docs/latest/api/auto-updater/).

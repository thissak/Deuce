# ADR 009: Electron 데스크톱 배포와 기본 브라우저 로그인

## Status

Accepted — 2026-09-08 감독의 앱 제작·배포 지시. 앞선 채팅 사용 확인을 수용하며,
기존 수동 검증 체크리스트를 데스크톱 착수의 차단 조건으로 사용하지 않는다.

## Decision

- `apps/desktop`에 Electron 44.2.0·electron-builder 26.15.3·electron-updater 6.8.9를
  고정한다. 기존 웹 SPA를 운영 HTTPS 주소에서 로드하므로 채팅·채널·MCP 기능을 공유한다.
- 원격 화면은 sandbox/contextIsolation을 켜고 Node integration·webview·임의 창 생성을
  차단한다. HTTPS 듀스 origin만 앱 내부에서 탐색하고 외부 HTTP(S) 링크는 기본 브라우저로 연다.
  알림·클립보드 쓰기는 신뢰 origin에서만 허용한다. preload는 창 포커스 기능만 노출하고
  IPC는 동일 창의 신뢰하는 메인 프레임인지 확인한다.
- Google 로그인은 Desktop app OAuth 클라이언트와 기본 브라우저를 사용한다.
  `google-auth-library` 11.0.2가 PKCE S256 생성·Google 코드 교환을 수행한다.
  앱의 임시 127.0.0.1 리스너는 state·경로·메서드·일회 수신을 검사하며 취소와 5분 만료를 처리한다.
- 앱은 ID 토큰만 HTTPS `/auth/desktop/session`으로 보내고 서버가 공식 `verifyIdToken`으로
  서명·발급자·만료·설정된 Desktop audience를 검증한다. 인증된 이메일·허용목록도 검사한 뒤
  기존 HttpOnly/Secure 세션을 발급한다. Google 액세스/리프레시 토큰은 저장하지 않는다.
- 웹·앱은 `User.googleSub` 고유 키를 공유한다. 기존 계정은 첫 검증 로그인 때 연결하고,
  다른 sub가 이미 연결된 이메일 계정을 덮어쓸 수 없다. 사용자 ID와 대화 기록은 유지한다.
- 자체 승인 폼·일회용 승인 코드 저장소는 제거한다. 세션 발급은 분당 30회/IP,
  본문 16KiB 제한을 적용하고 외부 Origin을 거부한다. 토큰·쿠키는 로그에 남기지 않는다.
- 공식 다운로드 JSON의 `installed` 설정은 gitignore된 `build/google-desktop.json`으로 가져온다.
  Desktop 클라이언트 값은 배포 앱에 포함되는 공개 클라이언트 설정이다. 기존 Web client secret은
  앱에 포함하지 않는다. 서버에는 Desktop client ID만 추가한다. 설정이 없으면 로그인은 503,
  설치 파일 제작은 beforePack 검증에서 실패한다.
- 단일 앱 인스턴스·지속 세션·트레이·메뉴·닫으면 숨김·알림 클릭 시 창 복귀를 제공한다.
  앱 종료는 메뉴에서 수행한다. 업데이트 확인은 시작/4시간 간격/수동 메뉴로 수행하고,
  다운로드·재시작은 사용자 선택 후 실행한다. 자동 업데이트는 공식 electron-updater에 맡긴다.
- Mac arm64/x64 DMG·ZIP은 Developer ID 서명과 Apple 공증·앱 staple을 거친다.
  Windows x64 NSIS는 기존 v1 스펙대로 서명 없이 제공하며 다운로드 화면에 이를 표시한다.
- 다운로드 페이지와 업데이트 피드는 `https://deuce.goldenlabs.dev/downloads/`에서 제공한다.
  별도 VM 디렉터리에서 허용된 설치/피드 파일만 제공하며 Range 요청을 지원한다.
  복구용 파일은 기존 비공개 GCS의 releases 아래 보관한다. 백업 버킷을 공개하지 않는다.

## Limits and validation

Electron 창은 인터넷 연결을 필요로 한다. 영상·화면 공유·오프라인 메시지는 이번 범위가 아니다.
서버 ID 토큰 검증·계정 연결·PKCE·콜백 state·취소·다운로드 범위 요청과 Chromium loopback 흐름을
자동 검증한다. 실제 Mac 서명/공증/기동과 공개 다운로드를 확인한다. Windows 설치·실행은
Windows 환경에서 직접 확인한 경우에만 검증 완료로 기록한다.

## Sources

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [RFC 8252 native application login](https://www.rfc-editor.org/info/rfc8252/)
- [Electron session API](https://www.electronjs.org/docs/latest/api/session)
- [electron-builder multi-platform](https://www.electron.build/docs/features/multi-platform-build/)
- [electron-builder v26 Windows](https://www.electron.build/v26/docs/win/)

## 이전 승인 오류와 전환 검증 (2026-09-08)

이전 0.1.0 자체 승인 폼에서 `invalid desktop approval`이 발생했다.
no-referrer에 따른 POST Origin:null은 재현했으나 same-origin 수정 후보의 전체 복귀는
시간 초과했다. 해당 헤더 수정 후보는 운영에 배포하지 않았다.
감독의 공식 방법 조사·전환 지시에 따라 위 네이티브 흐름으로 대체했다.

로컬/VM 격리 DB 서버 각 81개·데스크톱 3개 테스트와 로컬 타입 검사 통과. 서버 테스트는 Google 인증서
조회만 로컬 RSA 공개 키로 대체하여 공식 라이브러리의 실제 JWT 검증을 실행한다.
Chromium 하네스는 실제 앱 login 함수→브라우저 GET 콜백→서버 세션→auth/me를 검증한다.
하네스의 Google 응답은 모의이며 실제 계정 로그인 완료를 의미하지 않는다.
0.1.1 Desktop OAuth 설정·실계정/패키징 Mac 로그인·Mac 공증·다운로드 배포를 완료했다.
최초 패키징 Mac 로그인은 한 차례 실패했고 재시도에서 성공했으며 당시 실패 원인은 미확정이다.
Windows 실기·버전 간 업데이트는 미검증이다. 상세 결과는 데스크톱 이관 문서와 receipt를 따른다.

## 릴리스 단위 (2026-09-11)

운영 배포는 웹과 Windows x64·Mac arm64/x64 설치 파일, 두 업데이트 피드를 항상 같은 릴리스로 묶는다.
웹만 바뀌어 Electron 코드가 같더라도 데스크톱 버전을 올리고 설치 파일과 피드를 함께 공개한다.
각 플랫폼 산출물과 공개 다운로드를 모두 검증하기 전에는 운영 배포 완료로 기록하지 않는다.

- https://developers.google.com/identity/protocols/oauth2/native-app
- https://github.com/googleapis/google-cloud-node/blob/main/core/packages/google-auth-library-nodejs/samples/oauth2-codeVerifier.js
- https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration
- https://developers.google.com/identity/sign-in/web/backend-auth
- https://fetch.spec.whatwg.org/#append-a-request-origin-header

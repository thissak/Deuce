# iOS 클라이언트 Mac Pro Handoff

## 목적

Mac Pro 에이전트가 Windows에서 완성한 Flutter 공통 클라이언트를 Xcode 환경에서
iPhone으로 연결하고, 첫 메시지 버티컬 슬라이스가 동일하게 동작하는지 검증한다.
이 작업은 별도 iOS 앱이나 별도 서버 계약을 만드는 작업이 아니다.

## 시작 조건

- Windows 버티컬 슬라이스의 자동 검증이 모두 통과하고 수동 미확인 항목이 문서에
  구분되어 있어야 한다.
- 저장소에 Flutter 공통 클라이언트와 iOS Runner가 있어야 한다.
- 메시지 HTTP API와 실시간 이벤트 계약이 문서 또는 계약 파일로 고정되어 있어야 한다.
- 실제 Keycloak realm과 iOS 전용 OIDC public client를 만들 권한과 주소가 준비되어야 한다.
- Mac Pro가 개발 서버에 도달할 수 있는 사설 개발 경로가 준비되어 있어야 한다.

시작 조건이 충족되지 않았다면 임의의 iOS 전용 mock이나 별도 프로토콜을 만들지 말고
Windows 작업 결과를 기다린다.

## 작업 진입

1. Mac의 글로벌 `~/.claude/CLAUDE.md`를 끝까지 읽는다.
2. 저장소의 `CLAUDE.md`, `docs/PROGRESS.md`, `docs/CHANGELOG.md`를 순서대로 읽는다.
3. [ADR 002](../adr/002-flutter-client-platform-split.md)와
   [첫 메시지 슬라이스](../specs/first-message-vertical-slice.md),
   [메시지 계약 v1](../contracts/messages-v1.md),
   [ADR 004](../adr/004-keycloak-oidc-authentication.md),
   [인증 계약 v1](../contracts/auth-v1.md)을 읽는다.
4. Git 상태를 확인하고 Windows 작업자의 변경을 보존한다.

## Mac Pro 준비

- 전체 Xcode와 필요한 iOS Simulator를 설치한다.
- Xcode 라이선스와 개발자 디렉터리 설정을 완료한다.
- Flutter SDK를 Windows와 호환되는 프로젝트 버전으로 준비한다.
- `flutter doctor -v` 결과에서 iOS 개발에 필요한 항목을 해결한다.
- 실제 기기 검증 전 Apple Developer Team과 Bundle ID는 감독님에게 확인한다.

Apple 계정, 인증서, 프로비저닝 프로파일과 비밀값을 저장소에 추가하지 않는다.

## 실행 순서

프로젝트 경로와 Flutter 버전은 Windows 슬라이스가 생성한 저장소 설정을 따른다.

```bash
flutter pub get
flutter analyze
flutter test
flutter build ios --simulator --debug
flutter run -d <ios-simulator-id> \
  --dart-define=DEUCE_SERVER_URL=http://<approved-private-server-address>:3210 \
  --dart-define=DEUCE_OIDC_ISSUER=https://<approved-keycloak-issuer>/realms/deuce \
  --dart-define=DEUCE_OIDC_CLIENT_ID=deuce-ios
```

현재 서버 기본 바인딩은 Windows loopback이므로 Mac Pro에서 바로 접근할 수 없다.
공개 인터넷 포트를 열지 말고 감독님이 승인한 사설 개발 경로와 서버 주소가 준비된
뒤 위 값을 넣는다.

공통 코드 변경 없이 해결할 수 없는 iOS 문제가 발견되면 원인을 기록한 뒤 공통 코드
담당과 조율한다. 플랫폼 분기를 추가할 때는 iOS 런타임 차이에 필요한 최소 범위로
제한한다.

현재 `auth_controller.dart`의 redirect URI와 기본 client ID는 Windows 인증 슬라이스용
`http://127.0.0.1:0`, `deuce-windows`다. iOS에서 이를 그대로 재사용하지 않는다. Mac Pro
작업은 Keycloak에 별도 `deuce-ios` public client와 승인된 custom-scheme redirect URI를
등록하고, 같은 OIDC·서버 권한 계약을 유지하면서 플랫폼 redirect 선택만 분리한다.
client secret, access token과 refresh token을 소스·문서·일반 설정에 기록하지 않는다.

## 검증 시나리오

1. iPhone Simulator 또는 승인된 실제 기기에서 시스템 브라우저 OIDC 로그인을 완료한다.
2. `general` 멤버인 Deuce 사용자로 Windows 클라이언트와 동일한 채널에 접속한다.
3. Windows에서 보낸 메시지가 iPhone에 즉시 나타나는지 확인한다.
4. iPhone에서 보낸 메시지가 Windows에 즉시 나타나는지 확인한다.
5. iPhone 네트워크를 끊은 동안 메시지를 만든 뒤 재연결하여 누락분이 복구되는지
   확인한다.
6. 서버 재시작 후 기존 메시지가 유지되고 송수신이 계속되는지 확인한다.
7. 로그아웃 후 기존 Socket이 끊기고 같은 token의 HTTP 요청이 거부되는지 확인한다.

## 완료 산출물

- iOS Simulator 디버그 빌드 성공 기록
- 가능하면 승인된 실제 iPhone 실행 기록
- 공통 메시지 계약 호환 결과
- iOS 전용 변경 파일과 변경 이유
- 남은 코드 서명·배포·푸시 알림 과제
- `docs/PROGRESS.md`와 `docs/CHANGELOG.md` 갱신

## 제외 범위

- App Store 또는 TestFlight 배포
- APNs 푸시 알림
- R2 파일 업로드와 영상 재생
- Android 플랫폼 작업

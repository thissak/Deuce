# ADR 002: Flutter 공통 클라이언트와 플랫폼 작업 분리

## Status

Accepted

## Context

Deuce는 Teams와 Slack을 참고한 설치형 협업 앱으로 PC, Android와 iPhone을 지원해야
한다. 현재 작업 환경은 Windows이며 iPhone 빌드와 기기 검증에는 별도의 Mac Pro와
Xcode 환경을 사용한다. 플랫폼마다 별도 앱과 통신 규약을 만들면 작은 팀 규모에 비해
중복 구현과 상태 불일치 비용이 커진다.

## Decision

- PC, Android와 iPhone 클라이언트의 공통 구현 기술로 Flutter를 사용한다.
- 첫 메시지 버티컬 슬라이스는 Windows에서 공통 Dart 코드와 Windows 클라이언트를
  구현하고 검증한다.
- iOS Runner, Xcode 빌드, 코드 서명과 iPhone 기기 검증은 Mac Pro 에이전트가 같은
  저장소와 공통 Dart 코드를 사용해 수행한다.
- Android 연결은 Windows 버티컬 슬라이스가 통과한 뒤 같은 공통 코드로 진행한다.
- 플랫폼 담당자는 서버 API와 실시간 이벤트 계약을 별도로 분기하지 않는다.

## Consequences

- 메시지 UI와 상태 처리를 세 플랫폼에서 한 코드베이스로 유지할 수 있다.
- Windows 환경은 Xcode와 Apple 코드 서명 도구를 설치하거나 관리하지 않는다.
- iOS 플랫폼 문제는 Mac Pro에서만 재현·수정하므로 명시적인 handoff가 필요하다.
- 첫 슬라이스에서는 Windows만 검증되며 Android와 iPhone 지원 완료를 의미하지 않는다.

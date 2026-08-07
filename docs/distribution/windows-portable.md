# Windows 포터블 배포

## 패키지 생성

Windows x64 배포본은 Flutter Release 폴더 전체와 실행 안내문을 ZIP으로 묶는다. EXE만
배포하면 Flutter 런타임 DLL과 `data`가 빠져 실행되지 않는다.

검증된 빌드가 이미 있으면 다음 명령을 사용한다.

```powershell
cd D:\Projects\Deuce
.\scripts\package-windows-release.ps1 -Version 1.0.0-build1 -SkipBuild
```

공개 맥미니 설정으로 다시 빌드한 뒤 패키징하려면 `-SkipBuild`를 생략한다. 스크립트는
공개 issuer·서버 URL과 `deuce-windows` client ID로 Windows Release를 만든다.

출력은 Git에서 제외된 다음 경로에 생성된다.

```text
apps/client/build/distribution/Deuce-Windows-x64-<version>.zip
apps/client/build/distribution/Deuce-Windows-x64-<version>.zip.sha256
```

## 다른 PC에서 실행

1. ZIP과 `.sha256`을 함께 전달한다.
2. SHA-256을 확인한 뒤 ZIP을 로컬 폴더에 완전히 푼다.
3. `Deuce/deuce_client.exe`를 실행한다.
4. 시스템 브라우저에서 본인 Keycloak 계정으로 로그인한다.

다른 PC에는 서버, Keycloak이나 Tailscale을 설치하지 않는다. 인터넷과 기본 브라우저가
필요하다. 현재 빌드는 코드 서명되지 않아 Windows SmartScreen 경고가 나올 수 있으며,
경고가 나오면 배포자가 전달한 SHA-256과 먼저 대조한다.

2026-08-07 `1.0.0-build1`은 ZIP 내부 필수 파일 20개, EXE 스트림 해시, 체크섬 파일과
패키지 위치의 앱 기동을 확인했다.

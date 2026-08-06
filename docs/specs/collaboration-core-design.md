# 성숙한 채팅 시스템을 참고한 협업 코어 설계

## 상태

Draft. 첫 메시지 버티컬 슬라이스에서 검증한 구조를 유지하되, 실제 인증과 파일 공유를
구현하기 전에 필요한 설계 기준을 고정한다. `후보` 또는 `검증 필요`로 표시한 기술은
이 문서만으로 채택된 것으로 보지 않는다.

## 목적

Deuce는 공개 인터넷에서 10명 이하가 사용하는 PC·Android·iPhone용 설치형 협업
앱이다. Teams와 Slack에 익숙한 채널·스레드 UI를 제공하고, 사람과 에이전트가 같은
메시지와 파일 계약을 사용해야 한다.

채팅, 재접속 동기화, 권한과 객체 저장은 이미 성숙한 제품들이 해결한 영역이다. 이
문서는 Mattermost, Zulip, Matrix, FluffyChat과 Rocket.Chat의 검증된 패턴을 Deuce
규모에 맞게 줄여 적용하고, 전체 제품이나 프로토콜을 새 기반으로 도입하지 않는 이유를
기록한다.

## 현재 기준선

첫 메시지 슬라이스에서 다음 경로를 검증했다.

```text
Flutter Windows 앱
  ├─ Socket.IO: 메시지 전송과 실시간 수신
  └─ HTTP: 마지막 서버 순번 이후 누락 메시지 조회
          │
          ▼
TypeScript 서버 ── 저장 성공 후 방송 ── PostgreSQL
```

- 클라이언트가 `clientMessageId`를 만들고 서버가 재전송을 중복 저장하지 않는다.
- 서버가 PostgreSQL에 저장한 메시지만 acknowledgement와 실시간 이벤트로 보낸다.
- 클라이언트는 실시간 이벤트와 복구 조회 결과를 메시지 ID로 합치고 서버 순번으로
  정렬한다.
- 복구 조회가 실패하면 마지막 성공 복구 순번을 전진시키지 않는다.
- Keycloak OIDC access token을 Deuce 내부 사용자에 연결하고 `general` 멤버십을 HTTP와
  Socket.IO 명령마다 확인하는 인증 슬라이스를 구현했다.
- 메시지는 PostgreSQL에 저장하고 클라이언트의 마지막 성공 복구 커서는 아직 메모리에만
  유지한다.
- 실제 Keycloak 관통과 공개 HTTPS 경계를 검증하기 전 서버는 loopback에만 바인딩하고
  공개 인터넷에 노출하지 않는다.

구체적인 현재 형식은 [메시지 계약 v1](../contracts/messages-v1.md)에 둔다.

## 선배 사례에서 채택할 부분

| 레퍼런스 | 검증된 패턴 | Deuce 적용 |
|---|---|---|
| Mattermost | REST와 WSS 분리, PostgreSQL, S3 호환 파일 저장 | 전체 제품·서버 구조의 주 참고자료 |
| Zulip | 초기 상태와 이벤트 큐의 경합 방지, 마지막 이벤트 ID, Flutter 로컬 저장소 | 재접속·클라이언트 상태 처리의 주 참고자료 |
| Matrix | `next_batch`/`since` 기반 초기 스냅샷과 증분 동기화 | 불투명 커서와 재동기화 개념만 적용 |
| FluffyChat | Flutter 하나로 Windows·Android·iOS와 파일 공유 구현 | 설치형 다중 플랫폼 UI·클라이언트 참고자료 |
| Rocket.Chat | 채널 권한에 묶인 첨부파일, 크기·MIME 정책, S3 저장 | 파일 정책과 관리 UX 참고자료 |

소스 코드를 가져올 때는 제품의 실행 라이선스와 소스 라이선스를 구분한다. Mattermost
서버 소스와 FluffyChat·Matrix Dart SDK는 AGPL 범위를 포함하고, Rocket.Chat은
Community와 Enterprise 코드의 조건이 다르다. 구현을 직접 복사하거나 파생할 때는
별도의 라이선스 검토가 필요하다. Zulip과 Zulip Flutter는 Apache 2.0이지만, Deuce
요구에 필요한 작은 패턴만 참고하고 제품 코드를 이식하지 않는다.

## 전체 구조

```text
PC / Android / iPhone Flutter 앱
  ├─ HTTPS: 로그인, 조회, 명령, 누락 복구, 파일 권한 요청
  ├─ WSS(Socket.IO): 저장이 확정된 실시간 변경 수신
  └─ 서명 URL: 원본 파일을 R2와 직접 업로드·다운로드
                    │
                    ▼
Deuce TypeScript 서버 (맥미니)
  ├─ 인증과 세션 검증
  ├─ 워크스페이스·채널 권한 판정
  ├─ 메시지·파일 메타데이터 트랜잭션
  ├─ 실시간 이벤트 발행
  └─ R2 서명 URL 발급
          │                         │
          ▼                         ▼
     PostgreSQL              비공개 Cloudflare R2
```

PostgreSQL의 메시지와 파일 메타데이터가 애플리케이션 상태의 원본이다. WebSocket은
빠른 변경 통지 수단이지 영구 기록이나 유일한 복구 수단이 아니다. R2는 원본 파일만
보관하며 사용자·채널 권한을 판단하지 않는다.

## 메시지 전달과 상태 동기화

### 서버가 진실의 원천이다

1. 클라이언트가 전송 의도마다 고유한 `clientMessageId`를 만든다.
2. 서버가 인증 사용자와 채널 쓰기 권한을 확인한다.
3. 서버가 메시지를 한 번만 PostgreSQL에 저장한다.
4. 저장된 동일 메시지를 요청 acknowledgement와 `message:created` 이벤트에 사용한다.
5. 클라이언트는 ID로 중복을 제거하고 서버 순번으로 표시 순서를 결정한다.

클라이언트 재시도는 acknowledgement 유실을 전제로 한다. 전송 재시도 횟수만으로
중복을 막지 않고, 서버의 `(authorId, clientMessageId)` 유일성으로 멱등성을 보장한다.

### 실시간 수신과 복구는 함께 사용한다

Socket.IO의 기본 도착 보장은 at-most-once이며, 연결이 끊긴 동안 서버가 보낸 이벤트를
영구 보관하지 않는다. 따라서 다음 복구 경로를 유지한다.

1. 인증된 Socket.IO 연결과 채널 구독을 먼저 연다.
2. 마지막으로 성공 처리한 서버 커서 이후의 상태를 HTTP로 요청한다.
3. 조회 중 들어온 실시간 이벤트와 조회 결과를 ID로 병합한다.
4. 조회와 로컬 반영이 모두 성공한 뒤에만 복구 커서를 전진시킨다.
5. 커서를 사용할 수 없거나 불일치가 발견되면 서버 스냅샷으로 다시 동기화한다.

Socket.IO Connection State Recovery는 짧은 단절을 줄이는 선택적 최적화일 뿐이다.
복구가 항상 성공하지 않고 인증 미들웨어를 건너뛸 위험도 있으므로 PostgreSQL 기반
누락 조회를 대체하지 않는다.

### 커서와 로컬 상태

현재 `sequence`는 단일 채널 메시지 복구에 충분하다. 채널, 멤버십과 파일 상태도
실시간으로 변하기 시작하면 다음 중 하나를 별도 설계로 선택해야 한다.

- 리소스별 스냅샷과 메시지 커서를 각각 유지한다.
- 워크스페이스 변경 전체를 정렬하는 불투명 이벤트 커서를 도입한다.

10명 이하의 단일 서버 단계에서는 범용 이벤트 버스나 이벤트 소싱을 미리 만들지
않는다. 실제 두 번째 상태 종류가 복구 대상이 될 때 가장 작은 계약으로 확장한다.

앱 재시작과 모바일 백그라운드 복구를 위해 메시지, 채널, 마지막 성공 커서와 미전송
요청을 로컬 DB에 저장해야 한다. Flutter의 후보는 Zulip Flutter가 사용하는
Drift/SQLite다. 패키지 채택은 앱 재시작 복구 슬라이스에서 테스트한 뒤 확정한다.

## 인증과 권한

실제 Keycloak 관통과 공개 HTTPS 경계 검증 전에는 외부 바인딩, 공개 DNS 연결과 인터넷
배포를 하지 않는다. 인증 슬라이스는 다음 불변 조건을 만족해야 한다.

- 클라이언트가 보낸 사용자 ID를 신뢰하지 않고, 검증된 세션에서 사용자 ID를 얻는다.
- HTTP와 Socket.IO가 같은 인증·세션 폐기 기준을 사용한다.
- 연결 시점뿐 아니라 메시지 조회·전송, 채널 구독과 파일 서명 URL 발급 시 대상
  워크스페이스·채널 권한을 서버가 확인한다.
- 자체 회원가입은 기본적으로 닫고 관리자가 허용한 10명 이하의 사용자만 활성화한다.
- 로그아웃, 관리자 세션 폐기와 사용자 비활성화가 기존 실시간 연결에도 반영된다.
- 장기 자격 증명과 갱신 토큰은 앱 일반 설정이나 로그가 아니라 플랫폼 보안 저장소에
  저장한다.
- 사람 계정과 에이전트 계정은 같은 권한 모델을 사용하되 계정 유형과 실행 주체를
  감사할 수 있어야 한다.

인증 공급자는 [ADR 004](../adr/004-keycloak-oidc-authentication.md)에 따라 Keycloak
OIDC를 사용한다. 설치형 앱은 시스템 브라우저의 Authorization Code + PKCE `S256`을
사용하고, Deuce 서버는 검증한 `(issuer, subject)`를 내부 사용자에 연결한다. Keycloak은
신원과 자격 증명, Deuce PostgreSQL은 사용자 활성 상태와 채널 멤버십의 원본이다.
구체적인 token 전달과 세션 폐기 형식은 [인증 계약 v1](../contracts/auth-v1.md)을 따른다.

## 파일과 영상 공유

파일 원본 저장 결정은 [ADR 001](../adr/001-r2-object-storage.md)과
[R2 인프라 연결](../infrastructure/r2-connection.md)을 따른다.

```text
앱 ── 업로드 초기화 ──> Deuce 서버
                         ├─ 사용자·채널·파일 정책 확인
                         ├─ pending 메타데이터 생성
                         └─ 짧은 PUT 또는 multipart 서명 발급
앱 ───────── 원본 직접 업로드 ─────────> R2
앱 ── 업로드 완료 ────> Deuce 서버
                         ├─ R2 객체 크기·유형 확인
                         ├─ ready 전환과 메시지 연결
                         └─ 저장 확정 이벤트 발행
```

- 비공개 버킷과 서버 전용 R2 자격 증명을 유지한다.
- 서명 URL을 가진 사람은 만료 전까지 작업할 수 있으므로 짧게 발급하고 DB, 메시지와
  로그에 저장하지 않는다.
- 다운로드 URL도 요청할 때마다 채널 읽기 권한을 확인한 뒤 발급한다.
- 미완료 객체가 정상 첨부파일로 보이지 않도록 메타데이터 상태를 `pending`, `ready`,
  `failed`로 구분한다.
- 작은 파일은 단일 PUT을 사용하고, 영상처럼 크거나 재개가 필요한 파일은 R2 multipart
  upload를 사용한다. Cloudflare가 안내하는 약 100 MB는 초기 분기 후보이며 실제 제한은
  모바일 네트워크 관통 테스트 후 설정으로 확정한다.
- 서버는 원본 바이트를 영구 저장하거나 정상 경로에서 중계하지 않는다.

## 현재 규모에서 추가하지 않는 구성

- Matrix federation, E2EE 이벤트 그래프와 별도 homeserver
- Redis, RabbitMQ와 별도 실시간 전달 서비스
- Elasticsearch 또는 별도 검색 클러스터
- 다중 서버용 Socket.IO adapter와 세션 공유 계층
- 파일 원본의 맥미니 영구 저장 또는 전체 파일 프록시
- 서버 DB 복구를 대신하는 Socket.IO 메모리 패킷 보관

Redis나 작업 큐는 썸네일 생성, 영상 처리, 푸시 알림 또는 에이전트 실행처럼 요청과
분리해야 할 실제 백그라운드 작업이 생길 때 다시 검토한다. 10명 이하의 텍스트 메시지
전달만을 위해 미리 운영 구성요소를 늘리지 않는다.

## 권고 버티컬 슬라이스 순서

### 1. 실제 인증과 `general` 채널 권한

관리자가 만든 한 사용자가 Windows 앱에서 로그인하고, 인증된 HTTP와 Socket.IO로
메시지를 주고받으며, 세션 폐기 후 즉시 접근이 거부되는 경로를 먼저 관통한다.

완료 기준:

- `alice`·`bob` handshake fixture 없이 실제 사용자로 연결된다.
- 유효하지 않거나 폐기된 세션은 HTTP와 Socket.IO 모두 거부한다.
- `general` 멤버만 메시지를 조회·전송·구독할 수 있다.
- 토큰이나 세션 비밀이 저장소와 로그에 남지 않는다.
- 인증 성공 전 서버의 공개 인터넷 노출은 계속 금지한다.

### 2. R2 첨부파일 한 건 관통

Windows 앱에서 파일을 선택해 R2에 직접 올리고, 메시지에 연결한 뒤 다른 인증 사용자가
권한 확인을 거쳐 내려받는다. 첫 관통은 작은 이미지나 일반 파일로 시작하고, 같은
계약으로 큰 영상 multipart 업로드를 추가한다.

### 3. 앱 재시작 로컬 복구

로컬 DB에서 최근 메시지를 즉시 보여주고 마지막 성공 커서 이후만 서버와 동기화한다.
네트워크 단절, 앱 강제 종료와 모바일 백그라운드 복귀를 자동 검증한다.

### 4. 채널과 스레드

단일 `general` fixture를 실제 채널 멤버십으로 교체하고, 메시지의 상위 메시지 참조로
스레드를 추가한다. 이때 비메시지 상태의 복구 범위를 확인하고 커서 계약 확장 여부를
결정한다.

## 열린 결정

- 메시지 외 상태에 리소스별 커서와 워크스페이스 이벤트 커서 중 어느 방식을 적용할지
- 단일 PUT과 multipart upload의 실제 파일 크기 기준
- 파일 유형·최대 크기·보존 기간·삭제 복구 정책
- 맥미니 서버의 공개 인터넷 연결, TLS와 배포 방식

## 공식 참고자료

- [Mattermost 애플리케이션 구조](https://docs.mattermost.com/deployment-guide/application-architecture.html)
- [Mattermost 라이선스](https://github.com/mattermost/mattermost/blob/master/LICENSE.txt)
- [Socket.IO 전달 보장](https://socket.io/docs/v4/delivery-guarantees/)
- [Socket.IO Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery)
- [Zulip 실시간 push와 이벤트](https://zulip.readthedocs.io/en/stable/subsystems/events-system.html)
- [Zulip Flutter 로컬 저장소](https://github.com/zulip/zulip-flutter/blob/main/lib/model/store.dart)
- [Matrix Client-Server `/sync`](https://spec.matrix.org/latest/client-server-api/#get_matrixclientv3sync)
- [FluffyChat Flutter 클라이언트](https://github.com/krille-chan/fluffychat)
- [Rocket.Chat 파일 업로드 설정](https://docs.rocket.chat/docs/file-upload)
- [Cloudflare R2 presigned URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 객체 업로드](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Keycloak OIDC](https://www.keycloak.org/securing-apps/oidc-layers)

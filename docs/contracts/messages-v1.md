# 메시지 계약 v1

Flutter 클라이언트와 TypeScript 서버가 공유하는 첫 메시지 계약이다. 현재 채널은
`general` 하나이며 인증과 권한은 [인증 계약 v1](auth-v1.md)을 따른다.

## 공통 메시지

```json
{
  "id": "4f2b3ccc-0a4a-4fcb-ac4c-e36c368d6334",
  "clientMessageId": "66a88431-64d3-4dfc-96f8-d1bd25dc3f67",
  "sequence": 1,
  "channelId": "general",
  "authorId": "39c5bd6f-b06f-433a-9394-1d811e232c63",
  "authorDisplayName": "Alice",
  "body": "첫 메시지",
  "createdAt": "2026-08-06T00:00:00.000Z"
}
```

- `id`는 서버가 확정한 UUID다.
- `clientMessageId`는 클라이언트가 매 전송 의도마다 생성하는 UUID다.
- `sequence`는 서버가 증가시키는 복구 기준이다.
- `channelId`는 현재 `general`만 허용한다.
- `authorId`는 검증된 OIDC 신원에 연결된 Deuce 내부 사용자 UUID다.
- `authorDisplayName`은 Deuce 사용자 레코드의 표시 이름이다.
- `body`는 공백을 제거한 1자 이상 4,000자 이하 문자열이다.
- `createdAt`은 서버 시각의 ISO 8601 UTC 문자열이다.

## 인증 연결

Socket.IO handshake의 `auth`에 다음 값을 넣는다.

```json
{ "accessToken": "<access-token>" }
```

서버는 token의 서명·issuer·audience·만료·세션 폐기, Deuce 사용자 상태와 `general`
멤버십을 확인한다. 실패한 연결은 `unauthorized` 또는 `forbidden`으로 거절한다. URL
query와 메시지 payload로 token을 보내지 않는다.

## 메시지 전송

Socket.IO 이벤트 이름은 `message:send`다.

```json
{
  "clientMessageId": "66a88431-64d3-4dfc-96f8-d1bd25dc3f67",
  "channelId": "general",
  "body": "첫 메시지"
}
```

성공 acknowledgement:

```json
{
  "ok": true,
  "message": { "...": "공통 메시지" }
}
```

실패 acknowledgement의 `error`는 `invalid_message`, `unauthorized`, `forbidden` 또는
`store_failed`다. 서버는 명령마다 현재 사용자·세션·채널 권한을 다시 확인하고 DB 저장에
성공한 뒤에만 `message:created` 이벤트로 공통 메시지를 채널에 방송한다. 동일 작성자가
같은 `clientMessageId`를 재전송하면 기존 메시지를 acknowledgement로 돌려주고 다시
저장하거나 방송하지 않는다.

## 누락 메시지 복구

```text
GET /messages?channelId=general&afterSequence=12
Authorization: Bearer <access-token>
```

성공 응답:

```json
{
  "messages": []
}
```

`messages`는 `sequence` 오름차순이다. 클라이언트는 마지막으로 성공한 복구 순번을
유지하고 재연결 직후 그 순번 이후를 조회한다. 복구 조회가 실패하면 그 기준을
전진시키지 않는다. 조회와 실시간 이벤트가 겹칠 수 있으므로 `id`로 중복을 제거하고
`sequence`로 다시 정렬한다.

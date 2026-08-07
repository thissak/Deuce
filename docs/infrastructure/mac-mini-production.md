# 맥미니 상시 인증 서비스

## 현재 구조

2026-08-07 기준 Keycloak과 Deuce는 맥미니 loopback LaunchAgent로 실행되고 기존
Tailscale Funnel과 Caddy가 공개 HTTPS 경로만 전달한다. Cloudflare Tunnel과 DNS는
변경하지 않았으며 Cloudflare는 Deuce의 비공개 R2 저장소 범위로 남는다.

```text
Windows 앱·브라우저
        │ HTTPS
        ▼
Tailscale Funnel :443
        │
        ▼
Caddy :8080
  ├─ /keycloak/* ── Keycloak 127.0.0.1:8180
  ├─ API·Socket.IO ─ Deuce 127.0.0.1:3210
  └─ 그 외 ───────── 기존 정적 사이트
```

| 항목 | 운영값 |
|---|---|
| 공개 기준 URL | `https://ai-macmini.tail098c36.ts.net` |
| OIDC issuer | `https://ai-macmini.tail098c36.ts.net/keycloak/realms/deuce` |
| Keycloak | 26.7.0, OpenJDK 25, `com.goldenlab.deuce-keycloak` |
| Keycloak DB | PostgreSQL 17, DB·역할 `deuce_keycloak` |
| Deuce | 인증 커밋 `8dde4f2`, `com.goldenlab.deuce-server` |
| Deuce DB | PostgreSQL 17, DB `deuce`, 역할 `deuce_app` |

## 저장소 밖 운영 파일

| 경로 | 용도·권한 |
|---|---|
| `~/Library/Application Support/Deuce/server.env` | Deuce DB·OIDC 환경, `600` |
| `~/Library/Application Support/Deuce/keycloak/keycloak.conf` | Keycloak 운영 설정, `600` |
| `~/Library/Application Support/Deuce/keycloak/secrets.env` | DB·관리자·초기 사용자 비밀번호, `600` |
| `~/Library/LaunchAgents/com.goldenlab.deuce-server.plist` | Deuce LaunchAgent, `600` |
| `~/Library/LaunchAgents/com.goldenlab.deuce-keycloak.plist` | Keycloak LaunchAgent, `600` |

비밀 파일은 출력하거나 저장소로 복사하지 않는다. Keycloak 운영 관리자는 공개
관리자 UI가 아니라 SSH와 loopback `kcadm.sh`를 사용한다. bootstrap 임시 관리자는
영구 운영 관리자 검증 후 제거했다.

## 공개 경로

| 경로 | 동작 |
|---|---|
| `/keycloak/realms/deuce/*` | 로그인, token, logout, JWKS와 discovery |
| `/health` | Deuce 비인증 health |
| `/me`, `/messages`, `/auth/*`, `/admin/*` | Deuce 인증 HTTP |
| `/socket.io/*` | 인증 Socket.IO |
| `/keycloak/admin/*` | 공개 404 |
| `/keycloak/realms/master/*` | 공개 404 |

Keycloak back-channel logout은 공개 프록시가 아니라 맥미니 내부
`http://127.0.0.1:3210/auth/backchannel-logout`으로 호출한다. Deuce의 JWKS 조회도
Keycloak loopback을 사용하고 token의 issuer만 공개 HTTPS 값과 정확히 비교한다.

## 서비스 확인

```zsh
for label in com.goldenlab.deuce-keycloak com.goldenlab.deuce-server; do
  launchctl print "gui/$(id -u)/$label"
done

curl --fail http://127.0.0.1:9000/keycloak/health/ready
curl --fail http://127.0.0.1:3210/health
curl --fail https://ai-macmini.tail098c36.ts.net/health
curl --fail \
  https://ai-macmini.tail098c36.ts.net/keycloak/realms/deuce/.well-known/openid-configuration
```

검증 기준은 두 LaunchAgent가 `running`, Keycloak DB health가 `UP`, 공개 health와
discovery가 `200`, 무인증 `/messages`가 `401`, 공개 관리자·master realm 경로가
`404`인 것이다. Keycloak의 HTTP·관리·클러스터 리스너는 모두 `127.0.0.1`이어야 한다.

## 백업과 롤백

승격 직전 백업은 다음 경로에 있다.

```text
~/Library/Application Support/Deuce/backups/permanent-auth-20260807T001411Z
```

여기에는 Deuce custom-format DB dump, 이전 `server.env`, Deuce plist와 Caddyfile이 있다.
롤백할 때는 공개 Caddy 경로를 먼저 이전 파일로 복원하고 reload한 뒤 Deuce LaunchAgent를
내리고, 필요한 경우 DB dump와 이전 env·plist를 복원한다. 실제 복원은 메시지·사용자
데이터를 덮어쓰므로 대상과 백업 해시를 다시 확인한 후 별도 승인으로 수행한다.

## 남은 운영 검증

- 공개 경로에서 5분 access token 갱신·Socket 재연결·메시지 전송·로그아웃 관통
- 맥미니 로그아웃·로그인 또는 재부팅 뒤 두 LaunchAgent 자동 시작
- Deuce와 Keycloak PostgreSQL 정기 백업 및 복원 연습
- 신규 사용자별 Keycloak 계정과 Deuce 멤버십 발급 절차

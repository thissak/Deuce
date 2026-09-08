# ADR 005: 기존 GCP VM에 독립 웹 서비스 배포

- 상태: Accepted (2026-09-07, 감독의 기존 VM 추가 지시)

## 맥락

사용자는 같은 사내망이 아니라 각자 인터넷으로 접속한다. 두 실계정 검증을 위해
Electron보다 웹 테스트 배포를 먼저 진행한다. 기존 `YOUR_GCP_PROJECT` 프로젝트의
`YOUR_VM`에 자원 여유가 있고 PostgreSQL과 Cloudflare Tunnel이 이미 운영 중이다.

## 결정

- 새 VM·Docker·Caddy 대신 기존 VM에서 `deuce.service`를 별도 systemd 서비스로 운영한다.
- Node.js 24 LTS·pnpm 11.24.0을 `/opt/deuce` 아래에 설치한다. TS 서버는 `tsx`로 실행한다.
- React 빌드는 `@fastify/static`으로 API와 같은 프로세스에서 제공한다. SPA의
  `/chat`·`/activity` 새로고침을 지원하고, 없는 API·정적 자산은 404로 유지한다.
- 서버는 `127.0.0.1:4010`에만 바인딩한다. 별도 `deuce-gcp` Cloudflare Tunnel이
  `https://deuce.goldenlabs.dev`를 연결한다. 기존 리뷰게이트 터널은 재시작하지 않는다.
- 기존 PostgreSQL 17에 `deuce` DB·로그인 역할을 별도로 만든다. 리뷰게이트 DB와
  데이터를 섞지 않는다. 신규 DB로 시작하며 로컬 더미 사용자·메시지를 이관하지 않는다.
- 초기 첨부는 `/var/lib/deuce/uploads`에 저장한다. 매일 DB·첨부·설정을 비공개 GCS에
  백업한다. GCS 직접 파일 저장 드라이버는 여전히 미구현이다.
- 듀스 앱에 MemoryHigh 768MiB, MemoryMax 1GiB, CPUQuota 100%를 적용한다. 이 한도는
  공유 PostgreSQL 사용량까지 제한하지는 않는다.

## 결과

- 각자 브라우저로 접속할 수 있으며 Electron 개발과 독립적으로 사용 검증을 진행한다.
- 웹/API·터널·DB 계정·파일·백업은 분리하되 VM과 PostgreSQL 프로세스의 장애는 공유한다.
- 일일 백업 사이에 최대 약 하루 데이터 손실 가능성이 있다. 백업 성공 여부는 systemd에서
  확인하며 외부 실패 알림은 아직 없다. 가용성·처리량은 별도 부하 검증이 필요하다.
- Google OAuth의 승인된 리디렉션 URI에 배포 콜백을 추가해야 실제 로그인이 가능하다.

## 근거

- [Fastify static 공식 SPA 제공 예시](https://github.com/fastify/fastify-static#managing-cache-control-headers)
- [Cloudflare Tunnel 설정](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [GCS IAM 역할](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)

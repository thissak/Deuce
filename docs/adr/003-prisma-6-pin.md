# ADR 003: Prisma 6.19.3 정확 고정

- 상태: Accepted (2026-08-29)

## 맥락

서버 파운데이션(계획 ①)은 `prisma`·`@prisma/client`를 사용해 v1 채팅
도메인 스키마와 마이그레이션을 관리한다. 패키지를 추가하는 시점에 npm의
`latest` 태그가 가리키는 버전은 `8.0.0-rc`로, 아직 pre-release다.
pre-release를 그대로 받으면 서버 파운데이션과 무관한 Prisma 7 계열
툴체인 변경까지 같이 끌려온다.

또한 Prisma 7은 `schema.prisma`의 `datasource` 블록에서
`url = env("DATABASE_URL")`처럼 환경 변수를 직접 읽던 기존 Migrate 설정
방식을 깨뜨린다. Prisma 7에서 이 값을 쓰려면 `prisma.config.ts`와
드라이버 어댑터를 새로 구성해야 하는데, 이 저장소는 지금 6.x의 고전
`datasource url = env(...)` 패턴을 그대로 쓰고 있다.

## 결정

**`prisma`와 `@prisma/client`를 `6.19.3`으로 정확히 고정한다** (semver
range가 아닌 exact pin).

- `apps/server/package.json`의 두 패키지 버전에 `^` 없이 `6.19.3`을 쓴다.
- Prisma 업그레이드는 이 ADR을 superseded로 표시하는 별도의 의도적 결정
  (새 ADR)으로만 진행한다. 후속 계획(②~⑥)에서 다른 작업에 끼워
  Prisma를 올리지 않는다.

## 기각된 대안

- **`^7.0.0` 또는 `latest` 채택**: pre-release 태그를 그대로 받거나,
  `prisma.config.ts`+어댑터 마이그레이션 비용을 서버 파운데이션 범위에
  끼워 넣게 된다. 이 계획의 목표(로그인 가능한 API 서버)와 무관한 툴체인
  작업이라 범위를 벗어난다.
- **caret range(`^6.19.3`) 유지**: 마이너/패치 업데이트는 허용하되 메이저
  전환은 막고 싶었으나, 6.x 내에서도 예기치 않은 동작 변화가 있었던 전례가
  있어 팀 판단 없이 자동으로 올라가지 않도록 정확 고정을 택했다.

## 결과

- `apps/server`의 Prisma 스키마·마이그레이션은 6.x 고전 설정 방식을
  그대로 유지한다.
- Prisma 7로의 전환(어댑터 구성 포함)은 후속 계획에서 별도 ADR로 다룬다.
- 의존성 감사·업데이트 자동화가 있다면 `prisma`/`@prisma/client`를
  자동 상향 대상에서 제외한다.

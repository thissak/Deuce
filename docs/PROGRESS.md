---
lifecycle: active
---

# Deuce 진행 상태

## Bootstrap

- [x] 독립 Git 저장소와 `main` 브랜치 생성
- [x] Claude 문서 SSOT와 Codex 중개 구조 생성
- [x] 진행 상태와 변경 이력 문서 생성
- [x] GOLEM 카탈로그 등록 및 골든노트 연결 활성화

## 제품 정의

- [x] 프로젝트 목적 확정 — Microsoft Teams와 같은 기능 범위의 팀
  커뮤니케이션·협업 프로그램
- [x] 사용자·조직·권한 모델 확정 — 골든랩 내부 단일 조직, Google OAuth +
  허용 이메일 목록 (팀/채널 계층은 v2로 이연)
- [x] 첫 릴리스 범위와 기능 우선순위 확정 — v1은 Teams '채팅' 탭 재현 +
  프로젝트 사이트 임베드 모듈. `docs/design/2026-08-29-deuce-v1-spec.md`
- [x] 기술 스택 결정 — TS 풀스택 모노레포 + Electron (ADR 001),
  iframe 임베드 (ADR 002)
- [ ] Microsoft Teams의 사용자 기능을 기능 맵으로 정리 (v2 범위 선정 시)

## 현재 우선순위

- [x] v1 스펙 기반 구현 계획 수립 (writing-plans)
- [x] 서버 파운데이션(계획 ①) 구현 완료 — pnpm 모노레포, Fastify 서버
  스켈레톤, Prisma 스키마·마이그레이션, 세션·Google OAuth 인증, 리뷰
  수정 웨이브(보안·문서·부팅 검증) 반영
- [x] 계획 ② 대화·메시지 REST + 검색 구현 완료 — 인증 가드(허용목록 매 요청
  재검사·14일 세션), 대화방(DM 중복 방지·그룹·관리·읽음 커서), 메시지(인용·
  멘션·커서 페이지네이션·수정·삭제·반응·고정), pg_trgm 검색, 활동 피드
- [x] 계획 ③ Socket.IO 실시간·프레즌스·파일 구현 완료 — 쿠키 인증 소켓 +
  user/convo 룸, 이벤트 브로드캐스트 9종(타입 계약 `@deuce/shared` 고정),
  인메모리 프레즌스, 서버 경유 파일 첨부(로컬 드라이버·고아 정리·공유 탭),
  이월분(타인 제거·DTO 반환 전환·커서 정합) 포함
- [ ] 계획 ④ 웹 SPA (+이월: 포커스 복귀 시 presence:active 송신, 멤버 재추가
  시 conversation.created 중복 수신 처리, 403/404 비대칭 처리)
- [ ] 계획 ⑤ Electron 셸
- [ ] 계획 ⑥ 임베드 + 배포

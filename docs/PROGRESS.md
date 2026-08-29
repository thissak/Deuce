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

- [ ] v1 스펙 기반 구현 계획 수립 (writing-plans)
- [ ] 모노레포 부트스트랩과 구현 착수

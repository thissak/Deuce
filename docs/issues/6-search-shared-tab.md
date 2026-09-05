# #6 공유 탭에서 같은 방 검색 결과가 열리지 않음

**Issue**: https://github.com/thissak/Deuce/issues/6
**Status**: In Progress
**Created**: 2026-09-05

## 1. 문제

공유 탭을 선택한 뒤 같은 방의 메시지를 검색해 클릭하면 `?m=<id>`는 생기지만
공유 탭이 유지되고 메시지·강조 표시가 보이지 않는다. 로그인된 Chrome에서
Playwright로 재현했다. 다른 방에서 검색 결과를 클릭하는 경로는 통과했다.

자동 회귀 테스트도 `chat-tab `에 `active`가 없다는 이유로 실패했다.
재현: `pnpm --filter @deuce/web exec vitest run test/jump.test.tsx`.

## 2. 원인 분석

`ChatPage`의 `ChatView` key는 conversationId다. 같은 방 검색은 쿼리 문자열만
바꾸므로 로컬 `tab='shared'`가 유지된다. `Timeline`이 마운트되지 않아
`useJumpToMessage`도 실행되지 않는다. 수동으로 채팅 탭을 선택하면 같은 URL의
메시지가 정상 강조되고 쿼리도 제거된다. 로딩·검색 응답 문제가 아니다.

## 3. Best Practice 조사

- [React useState](https://react.dev/reference/react/useState#storing-information-from-previous-renders):
  외부 입력에 따라 현재 컴포넌트의 상태 일부만 조정할 때 조건부 렌더 중 상태
  갱신이 가능하다. 조건이 다음 렌더에서 해소돼야 한다.
- [React Router useSearchParams](https://reactrouter.com/api/hooks/useSearchParams):
  검색 파라미터 변경은 내비게이션이다. 방 ID만으로 초기화를 기대할 수 없다.
- 기존 React 상태 기능으로 해결 가능하다. 별도 상태 동기화 도구·이벤트 버스는
  필요 없다. 전체 ChatView 재마운트는 다른 로컬 상태까지 지우므로 피한다.

점프 완료 시에도 채팅 탭을 유지하고, 완료 후 공유 탭으로 다시 이동할 수 있는지
회귀 테스트에서 함께 검증한다.

## 4. 수정 내용

`ChatView`에서 메시지 이동 요청이 있고 공유 탭이 선택돼 있으면 채팅 탭으로
상태를 조정한다. `jump.test.tsx`는 실제 SearchBox 클릭부터 메시지 강조·URL
정리·공유 탭 재진입까지 검증한다.

## 5. 검증 결과

- 수정 전: 실 브라우저 및 회귀 테스트 실패 확인.
- 수정 후: 점프 테스트 7개, 웹 전체 19파일·128개 통과. 실 Chrome에서도
  공유 탭의 같은 방 검색 클릭 후 채팅 탭·강조·URL 정리 확인.
- 후속(Claude, 2026-09-05): `getByRole(..., { exact })` 3곳 제거 — Testing Library의
  문자열 `name`은 기본이 완전 일치라 의미 변화 없음. 점프 테스트 7개·웹 전체
  19파일 131개 통과, `pnpm --filter @deuce/web build` 통과.
- 실 Chrome(Claude Chrome 플러그인): 공유 탭 → 같은 방 검색 → 결과 클릭 시 채팅 탭
  전환·강조·URL 정리 재확인. 다른 방(이영희)에서 검색 → 김철수 방 이동·강조도 통과.

**Status**: Resolved (Codex 독립 검수 PASS 2026-09-05, 커밋·PR 대기)

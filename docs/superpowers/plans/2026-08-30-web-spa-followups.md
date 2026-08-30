# 웹 SPA 후속 정리 (계획 ④ 최종 리뷰 파킹분) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 ④ 최종 브랜치 리뷰에서 "병합 후 후속 작업"으로 파킹한 항목 전부를 정리한다 — 실패 피드백 일원화(최우선), 테스트 픽스처 분리, 컴포저·텍스트 렌더·소켓 정리·다이얼로그 접근성 소소 항목.

**Architecture:** 새 기능 없음. 공통 `ErrorNotice` 컴포넌트 하나로 뮤테이션 실패·조회 실패 피드백을 일원화하고, 나머지는 기존 파일의 국소 수정이다. 상태 동기화는 계속 react-query 캐시 단일 경로.

**Tech Stack:** 기존 그대로 — React 19 + Vite 7 + @tanstack/react-query 5 + vitest 4.1(jsdom) + @testing-library/react 16. 새 의존성 추가 금지.

**Spec:** 파킹 목록의 원본은 `docs/CHANGELOG.md` 2026-08-29 절(계획 ④)과 세션 메모리 `deuce-plan-carryovers.md`. 코드 기준 근거는 이 계획의 각 태스크에 인라인으로 옮겨 적었다(태스크만 읽어도 충분).

## Global Constraints

- 사용자 노출 문구는 한국어. 실패 문구는 아래 값을 그대로 쓴다(테스트가 이 문구를 단언한다):
  - 메시지 액션·그룹 관리 실패: `요청에 실패했습니다. 다시 시도해 주세요.`
  - 메시지 수정 실패(기존 유지): `수정에 실패했습니다. 다시 시도해 주세요.`
  - 음소거 실패: `음소거 설정에 실패했습니다. 다시 시도해 주세요.`
  - 대화 상세 조회 실패: `대화 정보를 불러오지 못했습니다.`
  - 타임라인 조회 실패: `메시지를 불러오지 못했습니다.`
  - 검색 로딩/실패: `검색 중…` / `검색에 실패했습니다.`
  - 활동 로딩/실패: `불러오는 중…` / `활동을 불러오지 못했습니다.`
  - 재시도 버튼 라벨: `다시 시도`
- 모든 API 응답은 shared zod 스키마 `.parse()` 경유(기존 계약 유지 — 이 계획에서 새 API 호출은 없음).
- 서버(`apps/server`)·shared(`packages/shared`)는 수정하지 않는다. `apps/web`과 문서만 건드린다.
- 테스트는 `pnpm --filter @deuce/web test -- --run`, 타입 체크는 `pnpm --filter @deuce/web typecheck`.
- 커밋 메시지는 기존 관례(`fix:`/`test:`/`chore:`/`docs:` + 한국어 요약).
- Karpathy: 요청된 항목 밖 개선 금지. 인접 코드 리팩터 금지.
- 워크트리에서 `docker compose up` 금지(웹 테스트는 DB 불필요).

## 파일 구조

- Create: `apps/web/test/fixtures.ts` — 테스트 공용 `msg` 픽스처 (Task 1)
- Create: `apps/web/src/components/ErrorNotice.tsx` — 실패 안내 + 선택적 재시도 버튼 (Task 2)
- Create: `apps/web/test/feedback.test.tsx` — 실패 피드백 테스트 (Task 2·3)
- Create: `apps/web/src/lib/useEscapeKey.ts` — Escape 닫기 훅 (Task 6)
- Create: `apps/web/test/dialogs.test.tsx` — 다이얼로그 접근성 테스트 (Task 6)
- Modify: `apps/web/test/cache.test.ts`, `messages.test.ts`, `upload.test.tsx`, `notify.test.ts`, `timeline.test.tsx`, `wiring.test.ts`, `messageActions.test.tsx`, `composer.test.tsx` — 픽스처 import 전환 (Task 1)
- Modify: `apps/web/src/components/MessageBubble.tsx` (Task 2·5), `ChatView.tsx` (Task 2·3), `GroupSettings.tsx` (Task 2·6), `Timeline.tsx`·`SearchBox.tsx`·`ActivityPage.tsx` (Task 3), `Composer.tsx`·`src/lib/mentions.ts` (Task 4), `src/lib/text.tsx`·`src/realtime/wiring.ts`·`src/realtime/socket.tsx` (Task 5), `NewChatDialog.tsx` (Task 6), `src/styles.css` (Task 2)
- Modify: `docs/CHANGELOG.md`, `docs/PROGRESS.md` (Task 7)

## 검증 기준 (Acceptance Criteria)

- [ ] 기준 1: `pnpm --filter @deuce/web test -- --run` 전체 그린이며, 보고되는 테스트 수가 "고유 개수 == 수집 개수"다 (cache.test 6개가 더 이상 다른 파일에서 재실행되지 않음)
- [ ] 기준 2: 반응·고정·삭제·음소거·그룹 관리 뮤테이션이 실패하면 해당 화면에 지정 실패 문구가 뜬다 — 테스트로 고정 (404 반응 실패는 문구 없이 재조회만)
- [ ] 기준 3: 대화 상세·타임라인·활동 조회 실패 시 지정 문구 + `다시 시도` 버튼이 뜨고 버튼이 refetch를 일으키며, 검색은 로딩(`검색 중…`)과 실패 문구가 구분된다 — 테스트로 고정
- [ ] 기준 4: `collectMentionIds`가 접두 중복 이름(`김철`/`김철수`)에서 정확히 일치한 이름의 id만 반환한다 — 테스트로 고정
- [ ] 기준 5: 본문 끝 문장부호가 붙은 URL(`https://…/a.`)의 링크 href에 문장부호가 포함되지 않는다 — 테스트로 고정
- [ ] 기준 6: `attachRealtime`이 반환한 detach 실행 후 소켓 이벤트가 캐시를 변경하지 않고, `SocketProvider` 정리에서 `socket.off()` 전체 해제가 사라진다 — 테스트로 고정
- [ ] 기준 7: `pnpm --filter @deuce/web typecheck` 통과

## 테스트 시나리오

- 정상 케이스: 반응 클릭 성공 → 문구 없음·캐시 반영(기존 테스트 유지) / 멘션 삽입 → 캐럿이 멘션 바로 뒤 / `@김`+Enter → 첫 후보 선택(기존 유지)
- 엣지 케이스: `@`만 입력 후 Enter → 멘션 선택이 아니라 전송 / `  안녕  ` 전송 → body `안녕` / URL 뒤 `. 끝` → 링크 밖 텍스트 / 404 액션 실패 → 문구 없이 타임라인 재조회
- 실패 케이스: 반응·음소거·그룹 이름 변경 500 → 지정 문구 노출 / 상세·타임라인·활동 조회 500 → 문구+`다시 시도` / 검색 500 → 실패 문구

---

### Task 1: 테스트 픽스처 분리 (`test/fixtures.ts`)

`msg` 픽스처가 `cache.test.ts`에 export로 살고 있어 이를 import하는 7개 파일마다 cache 테스트 6개가 함께 재실행된다(고유 80 / 수집 122). 픽스처를 전용 파일로 옮긴다. 순수 리팩터 — 새 테스트 없음, 전체 스위트 그린 + 수집 수 일치가 검증이다.

**Files:**
- Create: `apps/web/test/fixtures.ts`
- Modify: `apps/web/test/cache.test.ts` (msg 정의 제거, import 전환)
- Modify: `apps/web/test/messages.test.ts`, `upload.test.tsx`, `notify.test.ts`, `timeline.test.tsx`, `wiring.test.ts`, `messageActions.test.tsx`, `composer.test.tsx` (import 경로만 교체)

**Interfaces:**
- Produces: `test/fixtures.ts`의 `export function msg(over: Partial<MessageDto>): MessageDto` — 이후 모든 태스크의 새 테스트는 `./fixtures`에서 가져온다.

- [ ] **Step 1: fixtures.ts 생성**

```ts
// apps/web/test/fixtures.ts
import type { MessageDto } from '@deuce/shared'

export function msg(over: Partial<MessageDto>): MessageDto {
  return {
    id: 'm1', conversationId: 'c1',
    author: { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null },
    body: '안녕', deleted: false, replyTo: null, reactions: [], mentions: [], attachments: [],
    createdAt: '2026-08-29T00:00:00.000Z', editedAt: null, pinnedAt: null, ...over,
  }
}
```

- [ ] **Step 2: cache.test.ts에서 `msg` 정의를 지우고 `import { msg } from './fixtures'`로 교체** (파일 내 `data()` 헬퍼는 그대로 둔다)

- [ ] **Step 3: 나머지 7개 파일의 `from './cache.test'` → `from './fixtures'` 일괄 교체**

- [ ] **Step 4: 전체 스위트 실행**

Run: `pnpm --filter @deuce/web test -- --run`
Expected: 전체 PASS, 보고 테스트 수 80 (수집 122가 아님 — vitest 요약의 "Tests N passed"가 파일별 고유 합계와 일치)

- [ ] **Step 5: Commit** — `test: 픽스처 msg를 fixtures.ts로 분리 (cache 테스트 8회 재실행 제거)`

---

### Task 2: `ErrorNotice` + 뮤테이션 실패 피드백 (반응·고정·삭제·음소거·그룹 관리)

최종 리뷰 Important — 이 뮤테이션들이 실패해도 화면 변화가 전혀 없다. 공통 컴포넌트 하나로 문구를 일원화한다.

**Files:**
- Create: `apps/web/src/components/ErrorNotice.tsx`
- Modify: `apps/web/src/styles.css` (`.error-notice` 추가)
- Modify: `apps/web/src/components/MessageBubble.tsx`
- Modify: `apps/web/src/components/ChatView.tsx`
- Modify: `apps/web/src/components/GroupSettings.tsx`
- Create: `apps/web/test/feedback.test.tsx`

**Interfaces:**
- Produces: `export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void })` — Task 3도 이 컴포넌트를 쓴다. `role="alert"` div, `onRetry`가 있으면 `다시 시도` 버튼.

- [ ] **Step 1: 실패 테스트 작성** — `test/feedback.test.tsx` 신규. 하네스는 `messageActions.test.tsx` 패턴(fetch 스텁 + QueryClientProvider)을 따른다.

```tsx
// apps/web/test/feedback.test.tsx
import type { ConversationDetail } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationKey, messagesKey } from '../src/api/queries'
import { ChatView } from '../src/components/ChatView'
import { GroupSettings } from '../src/components/GroupSettings'
import { MessageBubble } from '../src/components/MessageBubble'
import type { MessagesData } from '../src/realtime/cache'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const mate = { id: 'u2', email: 'b@example.com', name: 'B', avatarUrl: null }

function detail(over: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'c1', type: 'DM', title: null, displayName: 'B', members: [me, mate],
    lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null, ...over,
  }
}

function failStub(status = 500) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'boom' }), { status, headers: { 'content-type': 'application/json' } }),
  )
}

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

afterEach(() => vi.unstubAllGlobals())

describe('뮤테이션 실패 피드백', () => {
  it('반응 실패 시 버블에 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <QueryClientProvider client={makeQc()}>
        <MessageBubble m={msg({})} isMine={false} meId="me1" memberNames={[]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    expect(await screen.findByText(/요청에 실패했습니다/)).toBeTruthy()
  })

  it('404 실패는 문구 없이 타임라인만 재조회한다', async () => {
    vi.stubGlobal('fetch', failStub(404))
    const qc = makeQc()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble m={msg({})} isMine={false} meId="me1" memberNames={[]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: messagesKey('c1') }))
    expect(screen.queryByText(/요청에 실패했습니다/)).toBeNull()
  })

  it('음소거 실패 시 헤더 아래 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    const qc = makeQc()
    qc.setQueryData(conversationKey('c1'), detail())
    qc.setQueryData<MessagesData>(messagesKey('c1'), { pages: [{ items: [], nextCursor: null }], pageParams: [''] })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatView me={me} conversationId="c1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    // 버튼 콘텐츠가 이모지(🔔)라 접근 이름이 title이 아니다 — getByTitle로 찾는다
    await userEvent.click(screen.getByTitle('음소거'))
    expect(await screen.findByText(/음소거 설정에 실패했습니다/)).toBeTruthy()
  })

  it('그룹 관리 실패 시 다이얼로그에 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <GroupSettings me={me} detail={detail({ type: 'GROUP', title: '팀방', displayName: '팀방' })} onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }))
    expect(await screen.findByText(/요청에 실패했습니다/)).toBeTruthy()
  })
})
```

주의: `ChatView`의 음소거 버튼 접근 이름은 `title` 속성(`음소거`)이다. `PresenceDot`·읽음 커서 전진 등 부수 fetch도 전부 스텁 실패로 떨어지지만 화면 동작에는 영향이 없다 — 테스트가 이를 전제한다.

- [ ] **Step 2: 실행해서 실패 확인**

Run: `pnpm --filter @deuce/web test -- --run feedback`
Expected: FAIL — 실패 문구를 찾지 못함 (404 테스트는 기존 동작이라 통과할 수 있음)

- [ ] **Step 3: ErrorNotice + 스타일 구현**

```tsx
// apps/web/src/components/ErrorNotice.tsx
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button className="btn-plain" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}
```

`styles.css`의 `.composer-error` 근처에 추가 (팔레트는 기존 `.composer-error` #c4314b 계열 유지):

```css
.error-notice { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 4px; background: #fcf0f2; color: #c4314b; font-size: 12.5px; }
```

- [ ] **Step 4: MessageBubble 반영** — `useMessageAction` 훅은 그대로 두고 표시만 추가한다.

컴포넌트 본문에 (기존 `const action = ...` 아래):

```tsx
const actionFailed = action.isError && !(action.error instanceof ApiError && action.error.status === 404)
```

편집 분기의 `<div className="composer-error">수정에 실패했습니다...` 를 `<ErrorNotice message="수정에 실패했습니다. 다시 시도해 주세요." />` 로 교체하고, 버블 안 `msg-actions` 블록 바로 뒤에 추가:

```tsx
{actionFailed && !editing && <ErrorNotice message="요청에 실패했습니다. 다시 시도해 주세요." />}
```

`ErrorNotice` import 추가 (`ApiError`는 이미 import되어 있다).

- [ ] **Step 5: ChatView 반영** — `</header>` 바로 뒤에:

```tsx
{mute.isError && <ErrorNotice message="음소거 설정에 실패했습니다. 다시 시도해 주세요." />}
```

- [ ] **Step 6: GroupSettings 반영** — `dialog-actions` div 바로 위에:

```tsx
{(rename.isError || addMember.isError || removeMember.isError || leave.isError) && (
  <ErrorNotice message="요청에 실패했습니다. 다시 시도해 주세요." />
)}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm --filter @deuce/web test -- --run feedback messageActions`
Expected: 전부 PASS (기존 `수정이 실패하면 편집 모드와 입력을 유지하고 안내한다` 테스트도 문구가 같으므로 그대로 통과)

- [ ] **Step 8: Commit** — `fix: 반응·고정·삭제·음소거·그룹 관리 실패 피드백 일원화 (ErrorNotice)`

---

### Task 3: 조회 실패 피드백 (상세·타임라인·검색·활동)

최종 리뷰 Important — 조회 실패 시 빈 패널만 남고, 검색·활동은 로딩과 빈 결과를 구분하지 않는다.

**Files:**
- Modify: `apps/web/src/components/ChatView.tsx`
- Modify: `apps/web/src/components/Timeline.tsx`
- Modify: `apps/web/src/components/SearchBox.tsx`
- Modify: `apps/web/src/components/ActivityPage.tsx`
- Modify: `apps/web/test/feedback.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `ErrorNotice`.

- [ ] **Step 1: 실패 테스트 추가** — `feedback.test.tsx`에 describe 블록 추가:

```tsx
import { ActivityPage } from '../src/components/ActivityPage'
import { SearchBox } from '../src/components/SearchBox'
import { Timeline } from '../src/components/Timeline'

describe('조회 실패 피드백', () => {
  it('대화 상세 조회 실패 시 안내 + 다시 시도 버튼', async () => {
    const fn = failStub()
    vi.stubGlobal('fetch', fn)
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <ChatView me={me} conversationId="c1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('대화 정보를 불러오지 못했습니다.')).toBeTruthy()
    const before = fn.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(before))
  })

  it('타임라인 조회 실패 시 안내 + 다시 시도 버튼', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <QueryClientProvider client={makeQc()}>
        <Timeline me={me} conversationId="c1" members={[me, mate]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('메시지를 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('검색은 로딩과 실패를 구분해 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))) // 영원히 pending
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <SearchBox />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '안녕{Enter}')
    expect(await screen.findByText('검색 중…')).toBeTruthy()
  })

  it('검색 실패 시 실패 문구 + 다시 시도', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <SearchBox />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('textbox'), '안녕{Enter}')
    expect(await screen.findByText('검색에 실패했습니다.')).toBeTruthy()
  })

  it('활동 피드는 로딩·실패·빈 상태를 구분한다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <ActivityPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('활동을 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.queryByText('새 활동이 없습니다.')).toBeNull()
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `pnpm --filter @deuce/web test -- --run feedback`
Expected: 새 테스트 5개 FAIL

- [ ] **Step 3: 구현**

`ChatView.tsx` — 403 분기 바로 아래에 (403이 먼저, 그다음 일반 에러, 그다음 로딩):

```tsx
if (detail.isError) {
  return (
    <section className="chat-view">
      <div className="chat-error">
        <ErrorNotice message="대화 정보를 불러오지 못했습니다." onRetry={() => void detail.refetch()} />
      </div>
    </section>
  )
}
```

`Timeline.tsx` — timeline div 안 맨 위(`load-older` 버튼 위)에:

```tsx
{q.isError && <ErrorNotice message="메시지를 불러오지 못했습니다." onRetry={() => void q.refetch()} />}
```

`SearchBox.tsx` — ul 안 맨 위에 (빈 결과 문구는 성공일 때만 뜨도록 조건 보강):

```tsx
{results.isPending && <li className="result-row">검색 중…</li>}
{results.isError && (
  <li>
    <ErrorNotice message="검색에 실패했습니다." onRetry={() => void results.refetch()} />
  </li>
)}
{results.isSuccess && results.data.length === 0 && <li className="result-row">결과가 없습니다.</li>}
```

(같은 검색어 재입력은 refetch를 일으키지 않으므로 실패 항목에도 `다시 시도` 버튼이 필요하다.)

`ActivityPage.tsx`:

```tsx
export function ActivityPage() {
  const navigate = useNavigate()
  const activity = useQuery(activityQuery)
  const items = activity.data ?? []
  return (
    <div className="activity-page">
      <h2>활동</h2>
      {activity.isPending && <p className="empty-state">불러오는 중…</p>}
      {activity.isError && <ErrorNotice message="활동을 불러오지 못했습니다." onRetry={() => void activity.refetch()} />}
      {activity.isSuccess && items.length === 0 && <p className="empty-state">새 활동이 없습니다.</p>}
      <ul className="search-results">
        {/* 기존 items.map(...) 그대로 */}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: 전체 실행**

Run: `pnpm --filter @deuce/web test -- --run`
Expected: 전체 PASS (기존 timeline·jump·app 테스트가 새 분기에 걸리지 않는지 확인)

- [ ] **Step 5: Commit** — `fix: 상세·타임라인·검색·활동 조회 실패 안내와 다시 시도 버튼`

---

### Task 4: 컴포저 정밀 수정 (멘션 캐럿·'@' 단독 Enter·접두 중복·trim)

최종 리뷰 Minor 4건. 모두 `Composer.tsx`/`mentions.ts` 국소 수정.

**Files:**
- Modify: `apps/web/src/lib/mentions.ts`
- Modify: `apps/web/src/components/Composer.tsx`
- Modify: `apps/web/test/mentions.test.ts`
- Modify: `apps/web/test/composer.test.tsx`

**Interfaces:**
- Produces: `collectMentionIds(text: string, members: UserDto[]): string[]` — 시그니처 불변, 매칭 규칙만 정확 일치로 변경.

- [ ] **Step 1: 실패 테스트 작성**

`mentions.test.ts`에 추가:

```ts
it('접두가 겹치는 이름은 긴 이름을 정확히 매칭한다', () => {
  const members = [
    { id: 'u1', email: 'a@x.com', name: '김철', avatarUrl: null },
    { id: 'u2', email: 'b@x.com', name: '김철수', avatarUrl: null },
  ]
  expect(collectMentionIds('@김철수 확인요', members)).toEqual(['u2'])
  expect(collectMentionIds('@김철 @김철수', members).sort()).toEqual(['u1', 'u2'])
})
```

`composer.test.tsx`에 추가 (기존 하네스 `renderComposer`·`me`·`mate` 재사용):

```tsx
it('멘션 삽입 후 캐럿이 멘션 바로 뒤에 놓인다', async () => {
  const fn = vi.fn()
  renderComposer(fn as unknown as typeof fetch, [me, mate])
  const box = screen.getByRole('textbox') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: '안녕 @ 뒤에도' } })
  box.setSelectionRange(4, 4)
  fireEvent.click(box) // refreshMention이 캐럿 위치를 읽는다
  fireEvent.mouseDown(screen.getByRole('button', { name: /김철수/ }))
  await waitFor(() => {
    expect(box.value).toBe('안녕 @김철수  뒤에도')
    expect(box.selectionStart).toBe(8) // '안녕 @김철수 ' 바로 뒤 (start 3 + '@'1 + 이름3 + 공백1)
  })
})

it("'@'만 입력한 Enter는 멘션 선택이 아니라 전송이다", async () => {
  const posted = msg({ id: 'new1', conversationId: 'c1', body: '@' })
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }),
  )
  renderComposer(fn as unknown as typeof fetch, [me, mate])
  await userEvent.type(screen.getByRole('textbox'), '@{Enter}')
  await waitFor(() => expect(fn).toHaveBeenCalledOnce())
})

it('본문 앞뒤 공백을 잘라 보낸다', async () => {
  const posted = msg({ id: 'new1', conversationId: 'c1' })
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }),
  )
  renderComposer(fn as unknown as typeof fetch)
  await userEvent.type(screen.getByRole('textbox'), ' 안녕 {Enter}')
  await waitFor(() => expect(fn).toHaveBeenCalledOnce())
  const body = JSON.parse((fn.mock.calls[0]?.[1] as RequestInit).body as string) as { body: string }
  expect(body.body).toBe('안녕')
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `pnpm --filter @deuce/web test -- --run composer mentions`
Expected: 새 테스트 4개 FAIL (캐럿 테스트는 jsdom이 값 대입 후 캐럿을 끝으로 보내므로 RED가 맞는지 실패 메시지로 확인 — 통과해 버리면 가짜 GREEN이니 구현자에게 보고)

- [ ] **Step 3: 구현**

`mentions.ts`:

```ts
export function collectMentionIds(text: string, members: UserDto[]): string[] {
  // 긴 이름 우선 — "@김철수"가 "김철"로도 매칭되지 않게 (renderMentions와 같은 규칙)
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length)
  const ids = new Set<string>()
  let at = text.indexOf('@')
  while (at !== -1) {
    const hit = sorted.find((u) => text.startsWith(`@${u.name}`, at))
    if (hit) ids.add(hit.id)
    at = text.indexOf('@', at + 1 + (hit ? hit.name.length : 0))
  }
  return [...ids].slice(0, 20) // 서버 계약: mentions 최대 20
}
```

`Composer.tsx` — `pickMention` 교체:

```tsx
const pickMention = (name: string) => {
  if (!mention) return
  const el = boxRef.current!
  const caret = el.selectionStart
  const pos = mention.start + name.length + 2 // '@' + 이름 + 공백 뒤
  setText(text.slice(0, mention.start) + `@${name} ` + text.slice(caret))
  setMention(null)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(pos, pos) // 리렌더가 캐럿을 끝으로 보내므로 되돌린다
  })
}
```

`onKeyDown`의 멘션 분기 교체 ('@' 단독일 때는 전송):

```tsx
if (candidates.length > 0 && mention && mention.query.length > 0) pickMention(candidates[0]!.name)
else submit()
```

`send`의 body를 `body: text.trim()`으로 변경 (mentions 수집은 기존대로 `text` 사용 — trim은 앞뒤 공백뿐이라 결과가 같다).

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @deuce/web test -- --run composer mentions`
Expected: 전부 PASS (기존 `팝업이 열려 있으면 Enter는 전송 대신 첫 후보를 고른다`는 query가 '김'이라 그대로 통과)

- [ ] **Step 5: Commit** — `fix: 컴포저 멘션 캐럿·단독 @ Enter·접두 중복 매칭·본문 trim`

---

### Task 5: URL 끝 문장부호 + 고정 배너 즉시 갱신 + 소켓 리스너 개별 해제

**Files:**
- Modify: `apps/web/src/lib/text.tsx`
- Modify: `apps/web/src/components/MessageBubble.tsx` (`useMessageAction` onSuccess 1줄)
- Modify: `apps/web/src/realtime/wiring.ts` (attachRealtime이 detach 반환)
- Modify: `apps/web/src/realtime/socket.tsx` (`socket.off()` 전체 해제 제거)
- Modify: `apps/web/test/text.test.tsx`, `messageActions.test.tsx`, `wiring.test.ts`

**Interfaces:**
- Produces: `attachRealtime(socket, qc, meId, onMessageNew?): () => void` — 반환값이 `void`에서 detach 함수로 변경. 호출부는 `socket.tsx` 한 곳.

- [ ] **Step 1: 실패 테스트 작성**

`text.test.tsx`에 추가:

```tsx
it('URL 끝 문장부호는 링크에서 제외한다', () => {
  render(<p>{renderBody('보세요 https://example.com/a. 그리고 끝', [])}</p>)
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('https://example.com/a')
  expect(link.textContent).toBe('https://example.com/a')
})
```

`messageActions.test.tsx`에 추가 (`conversationKey` import 추가):

```tsx
it('고정 성공 시 대화 상세(고정 배너)를 즉시 재조회한다', async () => {
  const fn = jsonStub(msg({ pinnedAt: '2026-08-29T01:00:00.000Z' }))
  const qc = renderBubble(msg({}), fn)
  const spy = vi.spyOn(qc, 'invalidateQueries')
  await userEvent.click(screen.getByRole('button', { name: '고정' }))
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: conversationKey('c1') }))
})
```

`wiring.test.ts` — `FakeSocket`에 `off` 추가 후 테스트 추가:

```ts
off(event: string, fn: (...args: never[]) => void) {
  if (this.handlers.get(event) === fn) this.handlers.delete(event)
  return this
}
```

```ts
it('detach 후에는 이벤트가 캐시를 건드리지 않는다', () => {
  const qc = new QueryClient()
  const socket = new FakeSocket()
  const detach = attachRealtime(socket as unknown as AppSocket, qc, 'me1')
  seedMessages(qc, 'c1')
  detach()
  socket.fire(RT.messageNew, msg({ id: 'n1', conversationId: 'c1' }))
  expect(qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items[0]?.id).toBe('seed')
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `pnpm --filter @deuce/web test -- --run text messageActions wiring`
Expected: 새 테스트 3개 FAIL (detach 테스트는 타입 에러로 컴파일 실패해도 RED로 인정)

- [ ] **Step 3: 구현**

`text.tsx`의 `renderBody` 루프에서 URL 꼬리 문장부호 제거:

```tsx
for (const match of body.matchAll(URL_RE)) {
  const url = match[0].replace(/[.,;:!?]+$/, '') // 문장 끝에 붙은 부호는 링크가 아니다
  const start = match.index
  if (start > last) out.push(...renderMentions(body.slice(last, start), memberNames, `t${i}`))
  out.push(
    <a key={`l${i++}`} href={url} target="_blank" rel="noreferrer">
      {url}
    </a>,
  )
  last = start + url.length
}
```

`MessageBubble.tsx` — `useMessageAction`의 `onSuccess` 첫 줄에 추가 + `conversationKey` import:

```ts
onSuccess: (m) => {
  void qc.invalidateQueries({ queryKey: conversationKey(conversationId) }) // 고정 배너 즉시 갱신
  if (m) qc.setQueryData<MessagesData>(messagesKey(conversationId), (d) => replaceMessage(d, m))
  else void qc.invalidateQueries({ queryKey: messagesKey(conversationId) })
},
```

`wiring.ts` — 핸들러를 이름 있는 상수로 빼고 detach를 반환한다 (로직 변경 없음):

```ts
export function attachRealtime(
  socket: AppSocket,
  qc: QueryClient,
  meId: string,
  onMessageNew?: (m: MessageDto) => void, // T10: 웹 알림 훅
): () => void {
  const replace = (m: MessageDto) =>
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => replaceMessage(d, m))

  const onNew = (m: MessageDto) => {
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => appendMessage(d, m))
    void qc.invalidateQueries({ queryKey: conversationsKey })
    onMessageNew?.(m)
  }
  const onUpdated = (m: MessageDto) => {
    replace(m)
    // 고정/고정 해제도 이 이벤트로 온다 — 상세(고정 배너) 갱신
    void qc.invalidateQueries({ queryKey: conversationKey(m.conversationId) })
    // 마지막 메시지를 수정하면 목록 미리보기(lastMessage.body)도 바뀐다
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onDeleted = (m: MessageDto) => {
    replace(m)
    void qc.invalidateQueries({ queryKey: conversationKey(m.conversationId) })
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onRead = (p: { conversationId: string; userId: string; lastReadMessageId: string }) => {
    // 타 기기에서 내가 읽은 경우 배지 해소. 타인 읽음 표시는 REST 스냅샷이 없어 v1 제외(레저 기록)
    if (p.userId === meId) void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onCreated = () => {
    // 멤버 재추가 시 중복 수신 가능 — invalidate는 멱등이라 무해 (이월 항목)
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onConvoUpdated = (p: { conversationId: string }) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    void qc.invalidateQueries({ queryKey: conversationKey(p.conversationId) })
  }
  const onRemoved = (p: { conversationId: string }) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    qc.removeQueries({ queryKey: messagesKey(p.conversationId) })
    qc.removeQueries({ queryKey: conversationKey(p.conversationId) })
  }
  const onPresence = (p: Parameters<typeof patchPresence>[1]) => {
    // 스냅샷을 아직 못 받았으면 패치하지 않는다 — 한 명짜리 캐시가 생기면
    // presenceQuery가 그걸 완전한 스냅샷으로 오해한다
    if (qc.getQueryData(presenceKey) === undefined) return
    qc.setQueryData<PresenceSnapshot>(presenceKey, (map) => patchPresence(map, p))
  }
  const onConnect = () => {
    // 룸 조인이 비동기라 접속 직후 이벤트 공백 가능 + 재접속 시 놓친 이벤트 — 전체 재동기화 (스펙 §5)
    void qc.invalidateQueries()
  }

  socket.on(RT.messageNew, onNew)
  socket.on(RT.messageUpdated, onUpdated)
  socket.on(RT.messageDeleted, onDeleted)
  socket.on(RT.reactionChanged, replace)
  socket.on(RT.readAdvanced, onRead)
  socket.on(RT.conversationCreated, onCreated)
  socket.on(RT.conversationUpdated, onConvoUpdated)
  socket.on(RT.conversationRemoved, onRemoved)
  socket.on(RT.presenceChanged, onPresence)
  socket.on('connect', onConnect)

  return () => {
    socket.off(RT.messageNew, onNew)
    socket.off(RT.messageUpdated, onUpdated)
    socket.off(RT.messageDeleted, onDeleted)
    socket.off(RT.reactionChanged, replace)
    socket.off(RT.readAdvanced, onRead)
    socket.off(RT.conversationCreated, onCreated)
    socket.off(RT.conversationUpdated, onConvoUpdated)
    socket.off(RT.conversationRemoved, onRemoved)
    socket.off(RT.presenceChanged, onPresence)
    socket.off('connect', onConnect)
  }
}
```

(핸들러 파라미터 타입이 `ServerToClientEvents`와 안 맞으면 shared의 이벤트 페이로드 타입을 import해 맞춘다 — 임의 `any` 금지.)

`socket.tsx` cleanup 교체:

```tsx
const detachRealtime = attachRealtime(socket, qc, meId, (m) =>
  maybeNotify(qc, meId, m, (id) => navigateRef.current(`/chat/${id}`)),
)
const detachSignals = attachPresenceSignals(socket)
socket.connect()
return () => {
  detachSignals()
  detachRealtime() // socket.off() 전체 해제 대신 붙인 것만 뗀다
  socket.disconnect()
}
```

- [ ] **Step 4: 전체 실행 + 타입 체크**

Run: `pnpm --filter @deuce/web test -- --run` / `pnpm --filter @deuce/web typecheck`
Expected: 전체 PASS (socket.test.tsx의 재연결 회귀 테스트 포함), 타입 에러 없음

- [ ] **Step 5: Commit** — `fix: URL 끝 문장부호 제외·고정 배너 즉시 갱신·소켓 리스너 개별 해제`

---

### Task 6: 다이얼로그 접근성 + notify·프레즌스 신호 테스트 보강

**Files:**
- Create: `apps/web/src/lib/useEscapeKey.ts`
- Create: `apps/web/test/dialogs.test.tsx`
- Modify: `apps/web/src/components/NewChatDialog.tsx`, `GroupSettings.tsx`
- Modify: `apps/web/test/notify.test.ts`, `wiring.test.ts`

**Interfaces:**
- Produces: `useEscapeKey(onClose: () => void): void` — document keydown에서 Escape면 onClose.

- [ ] **Step 1: 실패 테스트 작성**

`test/dialogs.test.tsx` 신규:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupSettings } from '../src/components/GroupSettings'
import { NewChatDialog } from '../src/components/NewChatDialog'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const detail = {
  id: 'c1', type: 'GROUP' as const, title: '팀방', displayName: '팀방', members: [me],
  lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null,
}

function qcp(ui: ReactNode) {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('다이얼로그 접근성', () => {
  it('새 채팅 다이얼로그는 role=dialog + 레이블 + Escape 닫기', () => {
    const onClose = vi.fn()
    qcp(<NewChatDialog me={me} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '새 채팅' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('그룹 설정 다이얼로그는 role=dialog + 레이블 + Escape 닫기', () => {
    const onClose = vi.fn()
    qcp(<GroupSettings me={me} detail={detail} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '그룹 설정' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

`notify.test.ts`에 추가:

```ts
it('삭제 메시지는 알림하지 않는다', () => {
  maybeNotify(qc, 'me1', msg({ deleted: true }), () => {})
  expect(FakeNotification.instances).toHaveLength(0)
})

it('알림 클릭 시 창 포커스 + 해당 방을 연다', () => {
  const onOpen = vi.fn()
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  maybeNotify(qc, 'me1', msg({ conversationId: 'c7' }), onOpen)
  FakeNotification.instances[0]?.onclick?.()
  expect(focus).toHaveBeenCalled()
  expect(onOpen).toHaveBeenCalledWith('c7')
  focus.mockRestore()
})
```

`wiring.test.ts`에 추가 — `FakeSocket`에 emit 기록을 더하고 (`emitted: string[] = []` 필드 + `emit(event: string) { this.emitted.push(event); return this }`), `RTC` import 후:

```ts
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('attachPresenceSignals', () => {
  it('탭 숨김/복귀·포커스에 맞춰 presence 신호를 보내고 detach 후에는 보내지 않는다', () => {
    const socket = new FakeSocket()
    const detach = attachPresenceSignals(socket as unknown as AppSocket)
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(socket.emitted).toEqual([RTC.presenceAway, RTC.presenceActive, RTC.presenceActive])
    detach()
    window.dispatchEvent(new Event('focus'))
    expect(socket.emitted).toHaveLength(3)
  })
})
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `pnpm --filter @deuce/web test -- --run dialogs notify wiring`
Expected: dialogs 2개 FAIL, notify·wiring 추가분은 현행 구현이 이미 맞으면 PASS — PASS라도 각 단언이 실제 동작을 잡는지 구현을 한 줄씩 무력화(예: `if (m.deleted) return` 제거)해 RED가 나는지 1회 확인 후 되돌린다

- [ ] **Step 3: 구현**

`src/lib/useEscapeKey.ts`:

```ts
import { useEffect } from 'react'

export function useEscapeKey(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}
```

`NewChatDialog.tsx` — 컴포넌트 본문에 `useEscapeKey(() => onClose())` 추가, dialog div에 `role="dialog" aria-modal="true" aria-label="새 채팅"`.

`GroupSettings.tsx` — `useEscapeKey(onClose)` 추가, dialog div에 `role="dialog" aria-modal="true" aria-label="그룹 설정"`.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @deuce/web test -- --run`
Expected: 전체 PASS

- [ ] **Step 5: Commit** — `fix: 다이얼로그 role·aria·Escape 닫기 + notify·프레즌스 신호 테스트 보강`

---

### Task 7: 문서 갱신

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: CHANGELOG에 2026-08-30 절 추가** (기존 2026-08-29 절 위)

```markdown
### 2026-08-30

- [fix] 웹 SPA 후속 정리(계획 ④ 최종 리뷰 파킹분) — 실패 피드백 일원화:
  반응·고정·삭제·음소거·그룹 관리 실패 시 `ErrorNotice` 안내(404 액션 실패는
  문구 없이 재조회 유지), 대화 상세·타임라인·활동 조회 실패 시 안내 +
  "다시 시도" 버튼, 검색 로딩·실패 구분
- [fix] 컴포저 정밀 수정 — 멘션 삽입 후 캐럿을 멘션 바로 뒤로 복원, `@` 단독
  입력의 Enter는 전송으로, `collectMentionIds` 접두 중복 이름 정확 매칭
  (긴 이름 우선, renderMentions와 동일 규칙), 본문 앞뒤 공백 trim 전송
- [fix] URL 끝 문장부호(`.,;:!?`)를 링크에서 제외, 고정/해제 성공 시 대화
  상세를 즉시 재조회(고정 배너 지연 제거), `attachRealtime`이 detach를
  반환해 소켓 리스너를 개별 해제(`socket.off()` 전체 해제 제거)
- [fix] 다이얼로그 접근성 — 새 채팅·그룹 설정에 `role="dialog"`·
  `aria-modal`·레이블·Escape 닫기
- [test] 픽스처 `msg`를 `test/fixtures.ts`로 분리 — cache 테스트 6개가
  import 파일마다 재실행되던 문제 해소(수집 수 == 고유 수). `maybeNotify`
  삭제 메시지·클릭 열기, `attachPresenceSignals` 신호·해제 테스트 보강
```

- [ ] **Step 2: PROGRESS 갱신** — 계획 ④ 항목의 마지막 문장("web 테스트 80개(고유). 픽스처 `msg`를 … 122개로 보인다")을 실측 개수로 교체하고, 계획 ④ 항목 아래에 완료 항목을 추가:

```markdown
- [x] 계획 ④ 후속 정리 완료 — 실패 피드백 일원화(ErrorNotice + 다시 시도),
  컴포저 정밀 수정(멘션 캐럿·단독 @ Enter·접두 중복·trim), URL 끝 문장부호,
  고정 배너 즉시 갱신, 소켓 리스너 개별 해제, 다이얼로그 접근성, 픽스처 분리
  (web 테스트 수집 수 == 고유 수, 실측 N개)
```

"실측 N개"의 N은 반드시 `pnpm --filter @deuce/web test -- --run` 출력의 실제 숫자로 채운다 — 추정 금지. CHANGELOG 2026-08-29 절의 기존 "80개(고유, 수집 기준 122 …)" 문구는 당시 사실이므로 수정하지 않는다.

- [ ] **Step 3: Commit** — `docs: 웹 SPA 후속 정리 반영 (CHANGELOG·PROGRESS)`

---

## 수용된 한계 (레저 후보)

- 실패 문구는 뮤테이션 상태가 리셋될 때까지 남는다(자동 사라짐 타이머 없음) — `role="alert"` + 재시도 시 자동 해소로 충분하다고 판단.
- 다이얼로그에 포커스 트랩은 넣지 않는다(내부 도구 범위, 라이브러리 미도입 원칙).
- 검색 `검색 중…`은 최초 조회(isPending)만 구분한다 — 같은 검색어의 백그라운드 재조회 표시는 범위 밖.

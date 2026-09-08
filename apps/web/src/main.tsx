import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ApiError } from './api/http'
import { meQuery } from './api/queries'
import { App } from './App'
import './styles.css'
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel'
import { errorType, initDiagnostics, record } from './diagnostics/recorder'

initDiagnostics()

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      record('query.error', { errorType: errorType(error) })
      // 어떤 /api 호출이든 401이면 세션 만료 — 로그인 화면으로 (허용목록 매 요청 재검사 대응)
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(meQuery.queryKey, null)
      }
    },
  }),
  mutationCache: new MutationCache({ onError: (error) => record('mutation.error', { errorType: errorType(error) }) }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <DiagnosticsPanel />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ApiError } from './api/http'
import { App } from './App'
import './styles.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // 어떤 /api 호출이든 401이면 세션 만료 — 로그인 화면으로 (허용목록 매 요청 재검사 대응)
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(['me'], null)
      }
    },
  }),
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
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

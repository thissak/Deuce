import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // DB 테스트가 같은 로컬 DB를 트런케이트하므로 파일 병렬 실행 금지
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
  },
})

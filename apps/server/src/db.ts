import { PrismaClient } from '@prisma/client'
import { requestTrace, roundMs } from './observability.js'

export const prisma = new PrismaClient().$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      const trace = requestTrace.getStore()
      if (!trace) return query(args)
      const started = performance.now()
      let failed = false
      try { return await query(args) } catch (error) { failed = true; throw error } finally {
        const durationMs = performance.now() - started
        trace.dbCount += 1
        trace.dbMs += durationMs
        // 인자·SQL·결과는 기록하지 않는다. Prisma 호출 시간이며 순수 SQL 실행 시간은 아니다.
        if (trace.queries.length < 100) trace.queries.push({ model: model ?? 'raw', operation, durationMs: roundMs(durationMs), failed })
      }
    },
  },
})

import { readFile } from 'node:fs/promises'
import { checkProvider, connectRunner } from './index.js'

const [path, provider = 'codex'] = process.argv.slice(2)
if (!path || !['codex', 'claude'].includes(provider)) {
  console.error('Usage: pnpm --filter @deuce/agent-runner start /path/deuce-connection.json codex|claude')
  process.exitCode = 1
} else {
  try {
    const config = JSON.parse(await readFile(path, 'utf8'))
    const selected = provider as 'codex' | 'claude'
    await checkProvider(selected)
    const runner = connectRunner({ ...config, provider: selected })
    await runner.start()
    console.log('Deuce AI connected. Keep this process running to respond to requests.')
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => runner.stop())
  } catch { console.error('AI 연결 실패: CLI 설치·로그인과 Deuce 연결 파일을 확인하세요.'); process.exitCode = 1 }
}

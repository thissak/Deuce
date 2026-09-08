import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { checkProvider, executeTask, type Task } from '../src/index.js'
const directories: string[] = [], children: number[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const pid of children.splice(0)) { try { process.kill(pid, 'SIGKILL') } catch { /* Already ended by cancellation. */ } }
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'deuce cli fixture ')); directories.push(path)
  const script = `#!/usr/bin/env node
const {spawn} = require('node:child_process'), fs = require('node:fs');
if (['login', 'auth'].includes(process.argv[2])) process.exit(0);
let input = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const task = JSON.parse(input.slice(input.indexOf('\\n') + 1));
  if (task.prompt === 'wait') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
    fs.writeFileSync(process.env.DEUCE_TEST_CHILD_PID, String(child.pid));
    setInterval(() => {}, 1000); return;
  }
  const claude = process.argv.includes('--print');
  if (claude && process.argv[process.argv.indexOf('--tools') + 1] !== '') process.exit(2);
  if (claude) console.log(JSON.stringify({result: task.prompt, is_error: false}));
  else { console.log(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: task.prompt}})); console.log(JSON.stringify({type: 'turn.completed'})); }
});
`
  await writeFile(join(path, 'fixture.cjs'), script)
  for (const name of ['codex', 'claude']) {
    if (process.platform === 'win32') await writeFile(join(path, name + '.cmd'), '@"%DEUCE_TEST_NODE%" "%~dp0fixture.cjs" %*\r\n')
    else await writeFile(join(path, name), script, { mode: 0o700 })
  }
  vi.stubEnv('PATH', path + delimiter + process.env.PATH)
  vi.stubEnv('DEUCE_TEST_NODE', process.execPath)
  const pidFile = join(path, 'child.pid'); vi.stubEnv('DEUCE_TEST_CHILD_PID', pidFile)
  return pidFile
}
const task = (prompt: string): Task => ({ id: randomUUID(), conversationId: randomUUID(), prompt, context: [] })
it.each(['codex', 'claude'] as const)('공백 경로의 %s CLI를 찾아 인자와 stdin 원문을 유지한다', async provider => {
  await fixture(); await checkProvider(provider)
  const prompt = '따옴표 " & | < > $(literal)\n한글 원문'
  expect(await executeTask(provider, task(prompt), new AbortController().signal)).toBe(prompt)
})
it('취소할 때 CLI가 실행한 하위 프로세스도 종료한다', async () => {
  const pidFile = await fixture(), controller = new AbortController()
  const execution = executeTask('codex', task('wait'), controller.signal).catch(error => error)
  try {
    await vi.waitFor(async () => expect(await readFile(pidFile, 'utf8')).toMatch(/^\d+$/))
    const pid = Number(await readFile(pidFile, 'utf8')); children.push(pid)
    controller.abort()
    expect(await execution).toBeInstanceOf(Error)
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 1500 })
  } finally { controller.abort(); await execution }
})

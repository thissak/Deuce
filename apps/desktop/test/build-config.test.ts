import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { appOrigin, validateOAuth } = require('../build/config.cjs')
const validatePackage = require('../build/validate.cjs')

it('self-host 앱에 HTTPS 원점만 허용하며 인증정보·경로·다른 프로토콜은 거부한다', () => {
  expect(appOrigin('https://CHAT.example.com:8443/')).toBe('https://chat.example.com:8443')
  for (const value of ['http://chat.example.com', 'file:///app', 'https://u:p@chat.example.com',
    'https://chat.example.com/chat', 'https://chat.example.com/?server=other', 'https://chat.example.com/#x',
    ' https://chat.example.com', 'invalid']) expect(() => appOrigin(value)).toThrow()
})

it('어느 운영자의 Desktop OAuth도 허용하지만 Web OAuth 파일은 거부한다', () => {
  const installed = { project_id: 'independent-project', client_id: 'test.apps.googleusercontent.com', client_secret: 'fixture' }
  expect(() => validateOAuth({ installed })).not.toThrow()
  expect(() => validateOAuth({ web: installed })).toThrow()
  expect(() => validateOAuth({ installed: { ...installed, client_id: 'not-google' } })).toThrow()
})

it('다른 운영자의 업데이트 피드로 앱을 패키징하지 못한다', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'deuce-build-test-'))
  try {
    mkdirSync(join(projectDir, 'build')); mkdirSync(join(projectDir, 'dist'))
    writeFileSync(join(projectDir, 'build/google-desktop.json'), JSON.stringify({ installed: {
      client_id: 'test.apps.googleusercontent.com', client_secret: 'fixture',
    } }))
    writeFileSync(join(projectDir, 'dist/build-config.json'), JSON.stringify({ origin: 'https://chat.example.com' }))
    const packager = { projectDir, config: { publish: { provider: 'generic', url: 'https://chat.example.com/downloads/' } } }
    await expect(validatePackage({ packager })).resolves.toBeUndefined()
    packager.config.publish.url = 'https://deuce.goldenlabs.dev/downloads/'
    await expect(validatePackage({ packager })).rejects.toThrow('Update feed must match')
  } finally { rmSync(projectDir, { recursive: true, force: true }) }
})

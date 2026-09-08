const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const DEFAULT_ORIGIN = 'https://deuce.goldenlabs.dev'

function appOrigin(value = DEFAULT_ORIGIN) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || value.trim() !== value) {
    throw new Error('DEUCE_APP_ORIGIN must be an HTTPS origin without credentials, path, query or fragment')
  }
  return url.origin
}

function readBuildConfig(projectDir) {
  const config = JSON.parse(readFileSync(join(projectDir, 'dist/build-config.json'), 'utf8'))
  const origin = appOrigin(config.origin)
  if (config.origin !== origin) throw new Error('Invalid built app origin; run pnpm build again')
  return { origin, updateUrl: `${origin}/downloads/` }
}

function validateOAuth(config) {
  const native = config.installed
  if (!native || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(native.client_id || '') ||
      typeof native.client_secret !== 'string' || !native.client_secret) {
    throw new Error('Google Desktop app OAuth JSON is required; Web application JSON is not accepted')
  }
}

module.exports = { appOrigin, readBuildConfig, validateOAuth }

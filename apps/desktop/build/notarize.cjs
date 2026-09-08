const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  const profile = process.env.DEUCE_NOTARY_PROFILE
  if (!profile) throw new Error('DEUCE_NOTARY_PROFILE is required for Mac distribution')
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const temp = mkdtempSync(join(tmpdir(), 'deuce-notary-'))
  try {
    const zip = join(temp, 'Deuce.zip')
    execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zip])
    console.log('Submitting signed Deuce app for Apple notarization')
    const result = JSON.parse(execFileSync('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', profile, '--wait', '--output-format', 'json'], { timeout: 1200000, encoding: 'utf8' }))
    console.log('Apple notarization', result.id, result.status)
    if (result.status !== 'Accepted') throw new Error(`Notarization failed: ${result.id}`)
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
  } finally { rmSync(temp, { recursive: true, force: true }) }
}

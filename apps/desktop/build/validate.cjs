const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { readBuildConfig, validateOAuth } = require('./config.cjs')
module.exports = async (context) => {
  const config = JSON.parse(readFileSync(join(context.packager.projectDir, 'build/google-desktop.json'), 'utf8'))
  validateOAuth(config)
  const { updateUrl } = readBuildConfig(context.packager.projectDir)
  const publish = context.packager.config.publish
  if (!publish || Array.isArray(publish) || publish.provider !== 'generic' || publish.url !== updateUrl) {
    throw new Error('Update feed must match the built server; use --config build/package.cjs')
  }
}

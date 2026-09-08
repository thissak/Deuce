const { join } = require('node:path')
const { readBuildConfig } = require('./config.cjs')

// Read the compiled app's configuration, so a later environment change cannot
// point an existing build at another operator's update feed.
const { updateUrl } = readBuildConfig(join(__dirname, '..'))
module.exports = {
  extends: join(__dirname, '../electron-builder.yml'),
  publish: { provider: 'generic', url: updateUrl },
}

const { build } = require('esbuild')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { appOrigin } = require('./config.cjs')

async function main() {
  const root = join(__dirname, '..')
  const origin = appOrigin(process.env.DEUCE_APP_ORIGIN)
  await build({ absWorkingDir: root, entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'cjs',
    external: ['electron', 'electron-updater'], outfile: 'dist/main.cjs',
    define: { __DEUCE_APP_ORIGIN__: JSON.stringify(origin) } })
  await build({ absWorkingDir: root, entryPoints: ['src/preload.ts'], bundle: true, platform: 'node', format: 'cjs',
    external: ['electron'], outfile: 'dist/preload.cjs' })
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist/build-config.json'), JSON.stringify({ origin }, null, 2) + '\n')
  console.log(`Desktop built for ${origin}; update feed ${origin}/downloads/`)
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BESPOK3D_DIR,
  GOLDEN_DIR,
  NETWORKING_DIR,
  describePackages,
  describeStagedDocs,
  goldenPath,
  serialize,
} from './harness.js'
import type { PackedPackage } from '../src/core/index.js'

// Capture the golden fixtures the equivalence rail compares against: the REAL current output of the
// legacy build scripts, snapshotted verbatim. This is deliberately NOT built from the b3-builder core
// (which is the thing under test); it runs the existing pack-plugins.sh index generation and the
// co-repo generate-atom / assemble-list, so the golden is an independent reproduction target.
//
// Re-runnable: `npm run capture-golden` re-syncs the golden if a plugin source changes. The golden is
// a snapshot of the plugin trees AS THEY ARE NOW; if those trees change, the golden must be recaptured
// (and the recapture reviewed) or the rail is measuring the ported core against stale expectations.

function copyIntoGolden(sourcePath: string, ...goldenParts: string[]): void {
  copyFileSync(sourcePath, goldenPath(...goldenParts))
}

function packagesIn(dir: string): PackedPackage[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.b3'))
    .sort()
    .map((filename) => ({ filename, path: join(dir, filename) }))
}

function pluginIdsIn(repoDir: string): string[] {
  return readdirSync(repoDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(repoDir, entry.name, 'manifest.json')))
    .map((entry) => entry.name)
    .sort()
}

// The monorepo dev bundle: the bundled index, the full .b3 content set, and the loose staged doc tree
// (all three are outputs of the monorepo build). The index is regenerated fresh from the current
// manifests (cheap, no baking); the .b3 descriptors and staged docs come from the already-built dist.
function captureMonorepo(): void {
  execFileSync('node', [join(BESPOK3D_DIR, 'scripts', 'generate-index.mjs')], {
    env: { ...process.env, B3D_INCLUDE_DEV_BUNDLE: '1' },
    stdio: 'inherit',
  })
  const distPlugins = join(BESPOK3D_DIR, 'dist', 'plugins')
  mkdirSync(goldenPath('monorepo'), { recursive: true })
  copyIntoGolden(join(distPlugins, 'index.json'), 'monorepo', 'index.json')
  writeFileSync(goldenPath('monorepo', 'packages.json'), serialize(describePackages(packagesIn(distPlugins))))
  writeFileSync(goldenPath('monorepo', 'docs.json'), serialize(describeStagedDocs(distPlugins)))
}

// One co-repo (networking): its per-plugin atoms and its assembled leaf sub-list, from the current
// forked generators. assemble-list writes the sub-list into the co-repo root (not gitignored there),
// so the sub-list is snapshotted then removed to leave the networking working tree clean.
function captureNetworking(): void {
  const scripts = join(NETWORKING_DIR, 'scripts')
  pluginIdsIn(NETWORKING_DIR).forEach((id) =>
    execFileSync('node', [join(scripts, 'generate-atom.mjs'), '--plugin', id], { stdio: 'inherit' }),
  )
  execFileSync('node', [join(scripts, 'assemble-list.mjs')], { stdio: 'inherit' })

  mkdirSync(goldenPath('networking'), { recursive: true })
  const atomsDir = join(NETWORKING_DIR, 'dist')
  readdirSync(atomsDir)
    .filter((name) => name.endsWith('.atom.json'))
    .sort()
    .forEach((name) => copyIntoGolden(join(atomsDir, name), 'networking', name))

  const subList = join(NETWORKING_DIR, 'index.json')
  copyIntoGolden(subList, 'networking', 'index.json')
  rmSync(subList, { force: true })
}

captureMonorepo()
captureNetworking()
process.stdout.write(`Captured golden fixtures under ${GOLDEN_DIR}\n`)

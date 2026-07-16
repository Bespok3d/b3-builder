import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GOLDEN_DIR, NETWORKING_DIR, describePackages, goldenPath, serialize } from './harness.js'
import type { PackedPackage } from '../src/core/index.js'

// Capture the golden fixtures the equivalence rail compares against: the REAL current output of the
// legacy co-repo build scripts, snapshotted verbatim. This is deliberately NOT built from the
// b3-builder core (the thing under test); it runs the co-repo generate-atom / assemble-list / pack.sh,
// so the golden is an independent reproduction target. (The monorepo-bundle golden relocated to
// Bespok3d's own test surface in relay packet 4, alongside app-bundle.mjs.)
//
// Re-runnable: `npm run capture-golden` re-syncs the golden if a plugin source changes. The golden is a
// snapshot of the plugin trees AS THEY ARE NOW; if those trees change, the golden must be recaptured
// (and the recapture reviewed) or the rail measures the ported core against stale expectations.
//
// ONE STANDING EXCEPTION (relay packet 7): a plugin that declares a `bake` field (the networking trio)
// must NOT have its golden recaptured until packet 9 retires the co-repo pack.sh. This capture runs the
// LEGACY pack.sh, which zips manifest.json verbatim (bake included); b3-builder's packer strips build-only
// fields (archive.ts BUILD_ONLY_MANIFEST_FIELDS), so a recapture would embed `bake` in the golden and turn
// the rail red against the correctly-stripped candidate. The committed pre-bake golden is right as-is.
// When packet 9 removes/strips pack.sh, recapture is safe again.

function copyIntoGolden(sourcePath: string, ...goldenParts: string[]): void {
  copyFileSync(sourcePath, goldenPath(...goldenParts))
}

function pluginIdsIn(repoDir: string): string[] {
  return readdirSync(repoDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(repoDir, entry.name, 'manifest.json')))
    .map((entry) => entry.name)
    .sort()
}

// The .b3 filename each plugin dir CURRENTLY resolves to (`<name>-<version>.b3`), so a recapture
// describes only the packages matching the current manifests and ignores stale older-version .b3 an
// always-repack pack.sh leaves behind in its dist.
function currentPackages(repoDir: string, distDir: string): PackedPackage[] {
  return pluginIdsIn(repoDir).map((id) => {
    const manifest = JSON.parse(readFileSync(join(repoDir, id, 'manifest.json'), 'utf8')) as { name: string; version: string }
    const filename = `${manifest.name}-${manifest.version}.b3`
    return { filename, path: join(distDir, filename) }
  })
}

// One co-repo (networking): its per-plugin atoms, its packed .b3 content set, and its assembled leaf
// sub-list, all from the current forked generators. pack.sh always-repacks the current manifests into
// dist; only the current-version .b3 are described (stale older-version leftovers are ignored).
// assemble-list writes the sub-list into the co-repo root (not gitignored there), so it is snapshotted
// then removed to leave the networking working tree clean.
function captureNetworking(): void {
  const scripts = join(NETWORKING_DIR, 'scripts')
  pluginIdsIn(NETWORKING_DIR).forEach((id) =>
    execFileSync('node', [join(scripts, 'generate-atom.mjs'), '--plugin', id], { stdio: 'inherit' }),
  )
  execFileSync('sh', [join(scripts, 'pack.sh')], { stdio: 'inherit' })
  execFileSync('node', [join(scripts, 'assemble-list.mjs')], { stdio: 'inherit' })

  mkdirSync(goldenPath('networking'), { recursive: true })
  const distDir = join(NETWORKING_DIR, 'dist')
  readdirSync(distDir)
    .filter((name) => name.endsWith('.atom.json'))
    .sort()
    .forEach((name) => copyIntoGolden(join(distDir, name), 'networking', name))

  writeFileSync(goldenPath('networking', 'packages.json'), serialize(describePackages(currentPackages(NETWORKING_DIR, distDir))))

  const subList = join(NETWORKING_DIR, 'index.json')
  copyIntoGolden(subList, 'networking', 'index.json')
  rmSync(subList, { force: true })
}

captureNetworking()
process.stdout.write(`Captured golden fixtures under ${GOLDEN_DIR}\n`)

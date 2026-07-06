import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
import {
  BESPOK3D_DIR,
  NETWORKING_DIR,
  describePackages,
  describeStagedDocs,
  goldenPath,
  loadJson,
  sortAtomsByName,
} from './harness.js'

// The golden-equivalence rail: packet 2's target. It builds a candidate via the b3-builder core and
// asserts it reproduces the committed golden (the current legacy scripts' real output) byte-for-byte,
// where "byte-for-byte" means: the bundled index / atoms / sub-list match by content, and each .b3
// matches by payload content hashes plus its parsed manifest (see harness ArchiveDescription).
//
// In packet 1 the core's pack + index steps are not ported, so runPipeline throws NotPortedError and
// these tests FAIL RED, on purpose. That is the rail biting before the port exists. When packet 2
// ports the core, the throw is gone and the assertions below run; when they pass, the rail is green.

function loadGoldenAtoms(): JsonObject[] {
  const dir = goldenPath('networking')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.atom.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as JsonObject)
}

describe('golden equivalence rail (packet 2 target)', () => {
  it('monorepo dev bundle: bundled index, .b3 content set, and staged docs reproduce the golden', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-mono-'))
    const artifacts = await runPipeline({
      kind: 'monorepo-bundle',
      sourceRoot: BESPOK3D_DIR,
      outputDir,
      channel: 'dev',
    })
    expect(artifacts.index).toEqual(loadJson(goldenPath('monorepo', 'index.json')))
    expect(describePackages(artifacts.packages)).toEqual(loadJson(goldenPath('monorepo', 'packages.json')))
    expect(describeStagedDocs(outputDir)).toEqual(loadJson(goldenPath('monorepo', 'docs.json')))
  }, 60_000)

  it('networking co-repo: per-plugin atoms + sub-list reproduce the golden', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-net-'))
    const artifacts = await runPipeline({
      kind: 'co-repo',
      sourceRoot: NETWORKING_DIR,
      outputDir,
    })
    expect(sortAtomsByName(artifacts.atoms)).toEqual(sortAtomsByName(loadGoldenAtoms()))
    expect(artifacts.index).toEqual(loadJson(goldenPath('networking', 'index.json')))
  }, 60_000)
})

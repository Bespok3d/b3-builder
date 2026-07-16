import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publisherRequest, runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
import { NETWORKING_DIR, describePackages, goldenPath, loadJson, sortAtomsByName } from './harness.js'

// The golden-equivalence rail for the PUBLISHER core: build a single plugin dir and a repo of plugin
// dirs via the clean pipeline (publisher/org identity passed in), and assert each reproduces the
// committed golden (the legacy generate-atom / assemble-list / pack.sh output) byte-for-byte.
// "byte-for-byte" means: the atoms and sub-list match by content (deep-equal, canonical JSON), and each
// .b3 matches by payload content hashes plus its parsed manifest (see harness ArchiveDescription).

const NETWORKING_IDENTITY = {
  atomRepo: 'Bespok3d/networking',
  listName: 'Bespok3d Networking',
  listPublisher: 'PLACEHOLDER',
}

function loadGoldenAtoms(): JsonObject[] {
  const dir = goldenPath('networking')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.atom.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as JsonObject)
}

function packageFilenameOf(pluginDir: string): string {
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8')) as { name: string; version: string }
  return `${manifest.name}-${manifest.version}.b3`
}

describe('publisher equivalence rail', () => {
  it('one plugin dir: the .b3 and atom reproduce the golden, no sub-list', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-plugin-'))
    const zerotierDir = join(NETWORKING_DIR, 'zerotier')
    const artifacts = await runPipeline({
      unit: 'plugin',
      sourceDir: zerotierDir,
      outputDir,
      identity: { atomRepo: NETWORKING_IDENTITY.atomRepo },
    })
    const goldenPackages = loadJson(goldenPath('networking', 'packages.json'))
    const zerotierFile = packageFilenameOf(zerotierDir)
    expect(artifacts.subList).toBeNull()
    expect(artifacts.atoms).toEqual([loadJson(goldenPath('networking', 'zerotier.atom.json'))])
    expect(describePackages(artifacts.packages)).toEqual({ [zerotierFile]: goldenPackages[zerotierFile] })
  }, 60_000)

  it('a repo of plugin dirs: per-plugin .b3 + atoms + assembled sub-list reproduce the golden', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-repo-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: NETWORKING_DIR,
      outputDir,
      identity: NETWORKING_IDENTITY,
    })
    expect(sortAtomsByName(artifacts.atoms)).toEqual(sortAtomsByName(loadGoldenAtoms()))
    expect(artifacts.subList).toEqual(loadJson(goldenPath('networking', 'index.json')))
    expect(describePackages(artifacts.packages)).toEqual(loadJson(goldenPath('networking', 'packages.json')))
  }, 60_000)

  // A repo that publishes no list of its own builds its atoms and .b3 files and stops there: the atoms
  // are identical to the sub-list repo's, only the assembled index.json is absent. That is what lets an
  // atom repo register into someone else's index-of-lists instead of owning a list.
  it('a repo of plugin dirs without a list identity: atoms only, no index.json', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-atoms-only-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: NETWORKING_DIR,
      outputDir,
      identity: { atomRepo: NETWORKING_IDENTITY.atomRepo },
    })
    expect(sortAtomsByName(artifacts.atoms)).toEqual(sortAtomsByName(loadGoldenAtoms()))
    expect(artifacts.subList).toBeNull()
    expect(existsSync(join(outputDir, 'index.json'))).toBe(false)
    expect(describePackages(artifacts.packages)).toEqual(loadJson(goldenPath('networking', 'packages.json')))
  }, 60_000)

  // A repo build that discovers no plugin dirs must not throw ENOENT writing index.json into an output
  // dir the packer never created (nothing was packed). It produces an empty sub-list cleanly.
  it('a repo of zero plugin dirs: empty atoms + empty sub-list, no crash', async () => {
    const emptyRepo = mkdtempSync(join(tmpdir(), 'b3-empty-repo-'))
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-empty-out-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: emptyRepo,
      outputDir,
      identity: NETWORKING_IDENTITY,
    })
    expect(artifacts.packages).toEqual([])
    expect(artifacts.atoms).toEqual([])
    expect((artifacts.subList as JsonObject).plugins).toEqual([])
    expect(existsSync(join(outputDir, 'index.json'))).toBe(true)
  })
})

// Which identity a repo build gets is decided once, when the raw invocation becomes a BuildRequest: a
// repo that names its list gets a ListIdentity and assembles one, a repo that names neither builds atoms
// only. Half a list identity is a publisher mistake worth failing on, not a shape to guess at.
describe('publisherRequest repo identity', () => {
  const baseInputs = {
    unit: 'repo' as const,
    sourceDir: '/src',
    outputDir: '/out',
    atomRepo: 'someone/some-repo',
    exclude: [],
    skipUnchanged: false,
    bake: false,
  }

  it('both list inputs present: a full sub-list identity', () => {
    const request = publisherRequest({ ...baseInputs, listName: 'Some List', listPublisher: 'Someone' })
    expect(request.identity).toEqual({
      atomRepo: 'someone/some-repo',
      listName: 'Some List',
      listPublisher: 'Someone',
    })
  })

  it('neither list input present: an atoms-only identity', () => {
    expect(publisherRequest(baseInputs).identity).toEqual({ atomRepo: 'someone/some-repo' })
  })

  // An Action passes every input it declares, so an unset list input arrives as '' rather than absent.
  it('empty-string list inputs count as absent: an atoms-only identity', () => {
    const request = publisherRequest({ ...baseInputs, listName: '', listPublisher: '' })
    expect(request.identity).toEqual({ atomRepo: 'someone/some-repo' })
  })

  it('only a list name: refuses the half identity', () => {
    expect(() => publisherRequest({ ...baseInputs, listName: 'Some List' })).toThrow(/BOTH/)
  })

  it('only a list publisher: refuses the half identity', () => {
    expect(() => publisherRequest({ ...baseInputs, listPublisher: 'Someone' })).toThrow(/BOTH/)
  })
})

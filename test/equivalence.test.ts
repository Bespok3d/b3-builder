// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publisherRequest, runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
import { ALL_THE_TAGS_DIR, FLUIDD_DIR, NETWORKING_DIR, describePackages, goldenPath, loadGoldenPackages, loadJson, sortAtomsByName, withoutAssemblyStamp } from './harness.js'

// The golden-equivalence rail for the PUBLISHER core: build a single plugin dir and a repo of plugin
// dirs via the clean pipeline (publisher/org identity passed in), and assert each reproduces the
// committed golden (the legacy generate-atom / assemble-list / pack.sh output) byte-for-byte.
// "byte-for-byte" means: the atoms and sub-list match by content (deep-equal, canonical JSON), and each
// .b3 matches by payload content hashes plus its parsed manifest (see harness ArchiveDescription).
//
// The golden is FROZEN. It was captured from the legacy scripts while they still existed, and those
// scripts are deleted repo by repo as each migrates onto this tool, so there is no recapture path and
// there must not be one: the rail's whole claim is "identical to what the legacy scripts produced",
// which a regenerated golden cannot make. The rail builds from the live sibling plugin trees, so a
// source change there (a version bump, an edited payload) turns it red. That is REAL information, not
// a cue to re-snapshot: never weaken the comparison, hand-edit a fixture, or fake output to green it.
// Reconciling a genuine source change against the frozen golden is a maintainer decision.

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
    const goldenPackages = loadGoldenPackages(goldenPath('networking', 'packages.json'))
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
    expect(withoutAssemblyStamp(artifacts.subList as JsonObject)).toEqual(loadJson(goldenPath('networking', 'index.json')))
    expect(describePackages(artifacts.packages)).toEqual(loadGoldenPackages(goldenPath('networking', 'packages.json')))
  }, 60_000)

  // The one repo that publishes a collection alongside its plugins, and the only rail case covering the
  // collection axis. A collection dir holds a manifest like any other source, so it is discovered and it
  // reaches the list, but it has no payload: no .b3 is packed for it and its entry carries no
  // download_url. The golden is the index.json the legacy assemble-list committed into that repo, frozen
  // here BEFORE the migration replaces that file with this tool's own output (asserting against a file
  // this tool later writes would prove nothing).
  //
  // Scoped to collections[] on purpose. That repo's committed index.json predates a version bump in its
  // own source (rfid-openprinttag 0.1.0 to 0.1.1), so its plugins[] is real legacy output of an OLDER
  // tree and asserting today's build against it would be asserting the bump away. The plugin-entry path
  // is the same code the networking and fluidd cases above already pin against a golden that IS current.
  //
  // The collections[] array of this one fixture was reconciled on 2026-07-28, on the maintainer's
  // instruction, after the source moved under it three ways: the all-the-tags collection went 0.1.0 to
  // 0.1.1 (its rfid-bambu member floor 0.1.0 to 0.2.0, updated_at 2026-06-30 to 2026-07-26) and a second
  // collection, materials-tracker-plus, was published on 2026-07-27. Say plainly what that costs: for
  // collections[] alone this fixture no longer carries the legacy claim, because the entries in it were
  // captured from this tool. It still catches unintended movement in the collection path, and the legacy
  // claim for the plugin-entry and package paths is untouched, carried by the networking and fluidd cases
  // above. Nothing else in the file was regenerated: its plugins[] is still the frozen legacy capture.
  it('a repo with a collection: the collection entry reproduces the golden and packs no .b3', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-collections-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: ALL_THE_TAGS_DIR,
      outputDir,
      identity: { atomRepo: 'Bespok3d/material-tags', listName: 'Material Tags', listPublisher: 'PLACEHOLDER' },
    })
    const golden = loadJson(goldenPath('all-the-tags', 'index.json'))
    const subList = artifacts.subList as JsonObject
    const packedNames = artifacts.packages.map((packed) => packed.filename)
    expect(subList.collections).toEqual(golden.collections)
    expect(packedNames.filter((filename) => filename.startsWith('all-the-tags-'))).toEqual([])
    expect(packedNames).toHaveLength((subList.plugins as JsonObject[]).length)
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
    expect(describePackages(artifacts.packages)).toEqual(loadGoldenPackages(goldenPath('networking', 'packages.json')))
  }, 60_000)

  // A real atom repo, on its own legacy golden: fluidd publishes no list, so this is the atoms-only
  // shape end to end. `fluidd-bleeding-edge` is caller curation, not a variant the tool knows about: it
  // carries a manifest but its payload is local-only and gitignored, so the legacy CI never packed it
  // and the migrated release.yml passes it as exclude-dirs. Excluding it here is what that caller does.
  it('the fluidd atom repo: its .b3 and atom reproduce the golden, no sub-list', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-fluidd-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: FLUIDD_DIR,
      outputDir,
      identity: { atomRepo: 'Bespok3d/fluidd-plugin' },
      exclude: ['fluidd-bleeding-edge'],
    })
    expect(artifacts.atoms).toEqual([loadJson(goldenPath('fluidd', 'fluidd.atom.json'))])
    expect(artifacts.subList).toBeNull()
    expect(existsSync(join(outputDir, 'index.json'))).toBe(false)
    expect(describePackages(artifacts.packages)).toEqual(loadGoldenPackages(goldenPath('fluidd', 'packages.json')))
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

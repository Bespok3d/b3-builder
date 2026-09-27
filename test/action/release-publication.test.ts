// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReleaseArgs } from '../../src/action/github-release.js'
import { publishUnits, releaseMarker } from '../../src/action/publish-units.js'
import type { ReleaseEvidence, ReleaseUnit } from '../../src/action/release-evidence.js'
import { sha256 } from '../../src/action/verify-package.js'
import { FixtureHost } from './release-fixtures.js'

function releaseFixture(kind: 'draft' | 'prerelease' | 'live' = 'draft') {
  const out = mkdtempSync(join(tmpdir(), 'unit-release-'))
  const version = kind === 'live' ? '1.0.0' : '1.0.0-pre'
  const filename = `selected-${version}.b3`
  writeFileSync(join(out, filename), 'verified payload')
  const unit: ReleaseUnit = { name: 'selected', version, sourceDigest: 'fixture', atom: { name: 'selected', version, download_url: filename }, assets: { [filename]: sha256(Buffer.from('verified payload')) } }
  const evidence: ReleaseEvidence = { sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), kind, repository: 'test/repo', units: [unit] }
  return { out, evidence, unit, host: new FixtureHost() }
}

describe('verified unit publication', () => {
  it.each(['live', 'draft', 'prerelease'] as const)('creates %s against the built commit', (kind) => {
    const args = createReleaseArgs('test/repo', 'selected-v1', '1'.repeat(40), kind, 'verified')
    expect(args.slice(args.indexOf('--target'), args.indexOf('--target') + 2)).toEqual(['--target', '1'.repeat(40)])
    expect(args.includes('--draft')).toBe(kind === 'draft')
    expect(args.includes('--prerelease')).toBe(kind === 'prerelease')
  })
  it('promotes the same draft without rebuilding or replacing any asset and retries as a no-op', () => {
    const { out, evidence, host } = releaseFixture()
    publishUnits(evidence, 'draft', out, 'private', host)
    const release = host.inspect('selected-v1.0.0-pre')!
    const original = release.assets.map((asset) => ({ ...asset }))
    publishUnits(evidence, 'prerelease', out, 'private', host)
    expect(release.id).toBe(1)
    expect(release.draft).toBe(false)
    expect(release.prerelease).toBe(true)
    expect(release.assets.slice(0, original.length)).toEqual(original)
    const effects = [...host.effects]
    publishUnits(evidence, 'prerelease', out, 'private', host)
    expect(host.effects).toEqual(effects)
  })
  it('refuses an unexpected existing release before creating any selected unit', () => {
    const { out, evidence, unit, host } = releaseFixture()
    const unexpected = { ...unit, name: 'unexpected' }
    evidence.units.push(unexpected)
    host.create('unexpected-v1.0.0-pre', evidence.sourceCommit, 'draft', 'other build')
    host.effects = []
    expect(() => publishUnits(evidence, 'draft', out, 'private', host)).toThrow('unexpected existing release')
    expect(host.effects).toEqual([])
  })
  it('refuses changed existing bytes before mutation and preserves unrelated releases', () => {
    const { out, evidence, host } = releaseFixture()
    host.create('unrelated-v0.1', '0'.repeat(40), 'live', 'incumbent')
    const incumbent = structuredClone(host.inspect('unrelated-v0.1'))
    publishUnits(evidence, 'draft', out, 'public', host)
    const release = host.inspect('selected-v1.0.0-pre')!
    host.bytes.set(release.assets[0]!.url, Buffer.from('changed'))
    const effects = [...host.effects]
    expect(() => publishUnits(evidence, 'draft', out, 'public', host)).toThrow('unexpected existing release asset')
    expect(host.effects).toEqual(effects)
    expect(host.inspect('unrelated-v0.1')).toEqual(incumbent)
  })
  it('binds source identity into the release marker', () => {
    const { evidence, unit } = releaseFixture()
    expect(releaseMarker(evidence, unit)).not.toBe(releaseMarker({ ...evidence, sourceCommit: '4'.repeat(40) }, unit))
  })
})

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKey } from 'openpgp'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../../src/core/pipeline.js'
import type { BuildRequest } from '../../src/core/types.js'
import { prepareEvidence, verifyEvidence } from '../../src/action/release-evidence.js'
import { stubPluginDir } from '../stub-plugin.js'

const identity = { sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), requireSignature: true }
async function prepared() {
  const sourceDir = mkdtempSync(join(tmpdir(), 'selected-repo-'))
  stubPluginDir({ name: 'selected', version: '1.0.0-pre', channel: 'beta' }, sourceDir)
  stubPluginDir({ name: 'unrelated', version: '0.9.0' }, sourceDir)
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
  const request: BuildRequest = { unit: 'repo', sourceDir, outputDir: mkdtempSync(join(tmpdir(), 'release-evidence-')), identity: { atomRepo: 'test/repo' }, signingKey: privateKey, releaseKind: 'draft', selectedIds: ['selected'] }
  const artifacts = await runPipeline(request)
  const evidence = await prepareEvidence(request, artifacts.atoms, identity)
  return { request, artifacts, evidence }
}

describe('nonpublishing release verification', () => {
  it('builds repo context but only selects the candidate and preserves channel', async () => {
    const { request, artifacts, evidence } = await prepared()
    expect(artifacts.packages).toHaveLength(2)
    expect(evidence.units.map((unit) => unit.name)).toEqual(['selected'])
    expect(evidence.units[0]!.atom).toMatchObject({ release_kind: 'draft', channel: 'beta' })
    await expect(verifyEvidence(request, identity)).resolves.toMatchObject({ sourceCommit: identity.sourceCommit })
    await expect(verifyEvidence({ ...request, releaseKind: 'prerelease' }, identity)).resolves.toBeDefined()
  })
  it('refuses missing pins, wrong source, wrong kind and a mismatched selection', async () => {
    const { request } = await prepared()
    await expect(verifyEvidence(request, { ...identity, builderCommit: '' })).rejects.toThrow('pin')
    await expect(verifyEvidence(request, { ...identity, sourceCommit: '4'.repeat(40) })).rejects.toThrow('binding')
    await expect(verifyEvidence({ ...request, releaseKind: 'live' }, identity)).rejects.toThrow('kind')
    await expect(verifyEvidence({ ...request, selectedIds: ['unrelated'] }, identity)).rejects.toThrow('selected unit')
  })
  it('refuses changed output bytes and missing required evidence signatures', async () => {
    const { request } = await prepared()
    const path = join(request.outputDir, 'selected-1.0.0-pre.b3')
    writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('changed')]))
    await expect(verifyEvidence(request, identity)).rejects.toThrow('asset changed')
    rmSync(join(request.outputDir, 'release-evidence.json.sig'))
    await expect(verifyEvidence(request, identity)).rejects.toThrow('signature missing')
  })
})

it('publishes the selected candidate while an unrelated real package asset stays byte-identical', async () => {
  const { FixtureHost } = await import('./release-fixtures.js')
  const { publishUnits } = await import('../../src/action/publish-units.js')
  const { request, artifacts, evidence } = await prepared()
  const host = new FixtureHost()
  const unrelated = artifacts.packages.find((artifact) => artifact.filename === 'unrelated-0.9.0.b3')!
  host.create('unrelated-v0.9.0', '5'.repeat(40), 'live', 'incumbent')
  host.upload('unrelated-v0.9.0', [unrelated.path])
  const before = structuredClone(host.inspect('unrelated-v0.9.0'))
  const bytes = Buffer.from(host.download(before!.assets[0]!))
  await verifyEvidence(request, identity)
  publishUnits(evidence, 'draft', request.outputDir, 'private', host)
  publishUnits(evidence, 'prerelease', request.outputDir, 'private', host)
  expect(host.inspect('unrelated-v0.9.0')).toEqual(before)
  expect(host.download(before!.assets[0]!)).toEqual(bytes)
})

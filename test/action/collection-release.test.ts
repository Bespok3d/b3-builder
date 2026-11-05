// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKey } from 'openpgp'
import { describe, expect, it } from 'vitest'
import { publishRelease } from '../../src/action/publish-release.js'
import type { ReleaseEvidence } from '../../src/action/release-evidence.js'
import { sha256 } from '../../src/action/verify-package.js'
import { verifyDetached } from '../../src/core/build/sign-bytes.js'
import type { JsonObject } from '../../src/core/types.js'
import { FixtureHost } from './release-fixtures.js'

const COLLECTION_TAG = 'plugin-motion-pack-v0.2.0'
const CHANGELOG_ASSET = 'motion-pack-0.2.0-CHANGELOG.md'
const PUBLISHED_PLUGIN = { name: 'motion-plugin', version: '0.1.0', download_url: 'https://fixture.invalid/motion-plugin-0.1.0.b3' }
const COLLECTION_ATOM = { kind: 'collection', name: 'motion-pack', version: '0.2.0', members: [{ id: 'motion-plugin', version: '>=0.1.0' }] }

function collectionOnlyRelease() {
  const outputDir = mkdtempSync(join(tmpdir(), 'collection-release-'))
  writeFileSync(join(outputDir, CHANGELOG_ASSET), '# Changelog\n')
  const evidence: ReleaseEvidence = {
    releaseTag: COLLECTION_TAG,
    sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40),
    kind: 'live', repository: 'test/repo',
    baseline: { plugins: [PUBLISHED_PLUGIN], collections: [{ name: 'motion-pack', version: '0.1.0' }] },
    builtList: { plugins: [], collections: [{ name: 'motion-pack', title: 'Motion Pack' }] },
    units: [{ name: 'motion-pack', version: '0.2.0', sourceDigest: 'fixture', atom: COLLECTION_ATOM, assets: { [CHANGELOG_ASSET]: sha256(Buffer.from('# Changelog\n')) } }],
  }
  return { outputDir, evidence, host: new FixtureHost() }
}

describe('a tag that selects only a collection', () => {
  it('cuts a release of its own that hosts the signed list with the collection merged in', async () => {
    const { privateKey, publicKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
    const { outputDir, evidence, host } = collectionOnlyRelease()
    await publishRelease(evidence, 'live', outputDir, 'public', host, privateKey)

    const release = host.inspect(COLLECTION_TAG)!
    expect(release.assets.map((asset) => asset.name).sort()).toEqual(['index.json', 'index.json.sig', CHANGELOG_ASSET, 'motion-pack.live.atom.json'])
    const listBytes = readFileSync(join(outputDir, 'index.json'))
    expect(await verifyDetached(listBytes, readFileSync(join(outputDir, 'index.json.sig'), 'utf8'), publicKey)).toBe(true)
    const list = JSON.parse(listBytes.toString('utf8')) as { plugins: JsonObject[]; collections: JsonObject[] }
    expect(list.plugins).toEqual([PUBLISHED_PLUGIN])
    expect(list.collections).toEqual([{ name: 'motion-pack', title: 'Motion Pack', version: '0.2.0', members: COLLECTION_ATOM.members, release_kind: 'live' }])
  })

  it('is a no-op when the same verified collection release is published again', async () => {
    const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
    const { outputDir, evidence, host } = collectionOnlyRelease()
    await publishRelease(evidence, 'live', outputDir, 'public', host, privateKey)
    const effects = [...host.effects]
    await publishRelease(evidence, 'live', outputDir, 'public', host, privateKey)
    expect(host.effects).toEqual(effects)
  })
})

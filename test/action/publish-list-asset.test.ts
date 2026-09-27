// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKey } from 'openpgp'
import { expect, it } from 'vitest'
import { publishList } from '../../src/action/publish-list.js'
import { mergePublishedList } from '../../src/action/published-baseline.js'
import type { ReleaseEvidence } from '../../src/action/release-evidence.js'
import { verifyDetached } from '../../src/core/build/sign-bytes.js'
import { FixtureHost } from './release-fixtures.js'

it('preserves unrelated published entries and their resolved dependencies verbatim', () => {
  const unrelated = { name: 'other', version: 'old', deps: ['base'], download_url: 'https://old.invalid/package' }
  const merged = mergePublishedList({ plugins: [{ name: 'selected', deps: ['dependency'] }], collections: [] }, [{ name: 'selected', version: 'new', download_url: 'https://new.invalid/package' }], { plugins: [unrelated] })
  expect(merged.plugins).toEqual([unrelated, { name: 'selected', deps: ['dependency'], version: 'new', download_url: 'https://new.invalid/package' }])
})

it('publishes exact signed merged list bytes on every selected release and a retry reuses signatures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'publish-list-'))
  const { privateKey, publicKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
  const host = new FixtureHost()
  host.create('selected-v1.0.0', '1'.repeat(40), 'live', 'fixture')
  const atom = { name: 'selected', version: '1.0.0', download_url: 'https://fixture.invalid/package' }
  const evidence: ReleaseEvidence = { repository: 'test/repo', sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), kind: 'live', baseline: { plugins: [] }, builtList: { plugins: [atom] }, units: [{ name: 'selected', version: '1.0.0', sourceDigest: '', atom, assets: {} }] }
  await publishList(evidence, [atom], directory, privateKey, host)
  const bytes = readFileSync(join(directory, 'index.json'))
  const signature = readFileSync(join(directory, 'index.json.sig'), 'utf8')
  expect(await verifyDetached(bytes, signature, publicKey)).toBe(true)
  const effects = [...host.effects]
  await publishList(evidence, [atom], directory, privateKey, host)
  expect(host.effects).toEqual(effects)
})

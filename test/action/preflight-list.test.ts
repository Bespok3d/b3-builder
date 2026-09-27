// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { publishRelease } from '../../src/action/publish-release.js'
import { releaseMarker } from '../../src/action/publish-units.js'
import type { ReleaseEvidence, ReleaseUnit } from '../../src/action/release-evidence.js'
import { FixtureHost } from './release-fixtures.js'

it('refuses existing list metadata before creating another selected release', async () => {
  const host = new FixtureHost()
  const output = mkdtempSync(join(tmpdir(), 'list-preflight-'))
  const unit: ReleaseUnit = { name: 'existing', version: '1.0.0', sourceDigest: 'fixture', atom: { name: 'existing', version: '1.0.0' }, assets: {} }
  const missing = { ...unit, name: 'missing', atom: { name: 'missing', version: '1.0.0' } }
  const evidence: ReleaseEvidence = { sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), repository: 'test/repo', kind: 'live', units: [unit, missing], baseline: { plugins: [] }, builtList: { plugins: [] } }
  host.create('existing-v1.0.0', evidence.sourceCommit, 'live', releaseMarker(evidence, unit))
  writeFileSync(join(output, 'index.json'), 'unexpected index bytes')
  host.upload('existing-v1.0.0', [join(output, 'index.json')])
  host.effects = []
  await expect(publishRelease(evidence, 'live', output, 'private', host, 'fixture key')).rejects.toThrow('missing selected release')
  expect(host.effects).toEqual([])
})

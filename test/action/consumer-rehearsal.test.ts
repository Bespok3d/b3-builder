// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { generateKey } from 'openpgp'
import { expect, it } from 'vitest'
import { runPipeline } from '../../src/core/pipeline.js'
import { publicHalfOfSigningKey } from '../../src/core/build/sign-bytes.js'
import { prepareVersion, comparePromotionPackages } from '../../src/action/version-only.js'
import { verifyPackage } from '../../src/action/verify-package.js'
import { prepareEvidence, verifyEvidence } from '../../src/action/release-evidence.js'
import { publishUnits } from '../../src/action/publish-units.js'
import { FixtureHost } from './release-fixtures.js'
import { consumerFixture, guardConsumer, stageConsumer } from './consumer-rehearsal-fixtures.js'
import type { BuildRequest } from '../../src/core/types.js'

const identity = { sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), requireSignature: true }
it.each(['daemon', 'jinni'] as const)('rehearses real %s guard and staging through draft, prerelease and exact Live promotion', async (family) => {
  const fixture = consumerFixture(family)
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
  guardConsumer(fixture.root, family, '1.0.0-pre')
  expect(() => guardConsumer(fixture.root, family, 'wrong')).toThrow()
  stageConsumer(fixture.root)
  const request: BuildRequest = { unit: 'repo', sourceDir: join(fixture.root, 'dist/package'), outputDir: join(fixture.root, 'dist'), identity: { atomRepo: 'test/repo' }, releaseKind: 'draft', selectedIds: [fixture.name], signingKey: privateKey }
  const candidate = await runPipeline(request)
  const evidence = await prepareEvidence(request, candidate.atoms, identity)
  await verifyEvidence(request, identity)
  const host = new FixtureHost()
  publishUnits(evidence, 'draft', request.outputDir, 'private', host)
  publishUnits(evidence, 'prerelease', request.outputDir, 'private', host)
  const candidateBytes = readFileSync(candidate.packages[0]!.path)
  const runtimePath = fixture.runtime ? join(fixture.root, fixture.runtime) : undefined
  prepareVersion(join(fixture.root, fixture.manifest), '1.0.0-pre', runtimePath)
  guardConsumer(fixture.root, family, '1.0.0')
  stageConsumer(fixture.root)
  const live = await runPipeline({ ...request, releaseKind: 'live' })
  const publicKey = await publicHalfOfSigningKey(privateKey)
  await verifyPackage(live.packages[0]!.path, publicKey, true)
  comparePromotionPackages(candidate.packages[0]!.path, live.packages[0]!.path, '1.0.0-pre', family === 'daemon')
  expect(readFileSync(candidate.packages[0]!.path)).toEqual(candidateBytes)
  const liveEvidence = await prepareEvidence({ ...request, releaseKind: 'live' }, live.atoms, { ...identity, sourceCommit: '4'.repeat(40) })
  publishUnits(liveEvidence, 'live', request.outputDir, 'private', host)
  expect(host.releases.size).toBe(2)
  const archive = new AdmZip(live.packages[0]!.path)
  const payload = family === 'daemon' ? 'files/version.py' : 'files/device.py'
  archive.updateFile(payload, Buffer.concat([archive.readFile(payload)!, Buffer.from('# non-version mutation\n')]))
  archive.writeZip(live.packages[0]!.path)
  expect(() => comparePromotionPackages(candidate.packages[0]!.path, live.packages[0]!.path, '1.0.0-pre', family === 'daemon')).toThrow('non-version payload')
})

it('version preparation refuses a different runtime assignment before either source file is changed', () => {
  const fixture = consumerFixture('daemon')
  const manifestPath = join(fixture.root, fixture.manifest)
  const original = readFileSync(manifestPath)
  writeFileSync(join(fixture.root, 'version.py'), 'DAEMON_VERSION = "other"\n')
  expect(() => prepareVersion(manifestPath, '1.0.0-pre', join(fixture.root, 'version.py'))).toThrow('assignment')
  expect(readFileSync(manifestPath)).toEqual(original)
})

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { join, resolve } from 'node:path'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { generateKey } from 'openpgp'
import { actionRequest } from '../../src/action/release-inputs.js'
import { runPipeline } from '../../src/core/pipeline.js'
import { prepareEvidence, verifyEvidence } from '../../src/action/release-evidence.js'
import { publishUnits } from '../../src/action/publish-units.js'
import { FixtureHost } from './release-fixtures.js'
import { stubPluginDir } from '../stub-plugin.js'

function tagRequest(sourceDir: string, tag: string) {
  return actionRequest({ B3D_SOURCE: sourceDir, B3D_OUT: join(mkdtempSync(join(tmpdir(), 'tag-output-')), 'dist'), B3D_UNIT: 'repo', B3D_ATOM_REPO: 'fixture/publisher', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag })
}

function basePublisherSource(): string {
  const workspace = process.env.B3D_CONSUMER_WORKSPACE ?? resolve(import.meta.dirname, '../../..')
  return resolve(workspace, 'plugins/u1-base')
}

it('selects only the tagged package from an unchanged real multi-plugin publisher', () => {
  const source = basePublisherSource()
  const selected = tagRequest(source, 'plugin-u1-base-print-task-config-v0.1.0')
  expect(selected.selectedIds).toEqual(['u1-base-print-task-config'])
  expect(selected.releaseKind).toBe('live')
  expect(() => tagRequest(source, 'plugin-missing-v0.1.0')).toThrow('does not select exactly one')
})

it('infers a candidate release from its tagged version and leaves the rest of the repo unselected', () => {
  const source = mkdtempSync(join(tmpdir(), 'tag-source-'))
  stubPluginDir({ name: 'selected', version: '1.0.0-pre' }, source)
  stubPluginDir({ name: 'unrelated', version: '1.0.0' }, source)
  const selected = tagRequest(source, 'plugin-selected-v1.0.0-pre')
  expect(selected.selectedIds).toEqual(['selected'])
  expect(selected.releaseKind).toBe('draft')
})

it('prepares and publishes the exact signed package of a previously unchanged U1 base repository', async () => {
  const source = basePublisherSource()
  const request = tagRequest(source, 'plugin-u1-base-print-task-config-v0.1.0')
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture publisher' }], format: 'armored' })
  const signed = { ...request, signingKey: privateKey }
  const identity = { sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), releaseTag: 'plugin-u1-base-print-task-config-v0.1.0', preparation: { tag: 'plugin-u1-base-print-task-config-v0.1.0', runId: 101, runAttempt: 1 }, requireSignature: true }
  const built = await runPipeline(signed)
  const evidence = await prepareEvidence(signed, built.atoms, identity)
  expect(evidence.preparation).toEqual(identity.preparation)
  const selectedPackage = join(signed.outputDir, 'u1-base-print-task-config-0.1.0.b3')
  const verifiedBytes = readFileSync(selectedPackage)
  await verifyEvidence(signed, identity)
  const host = new FixtureHost()
  publishUnits(evidence, 'live', signed.outputDir, 'public', host)
  expect(evidence.units.map((unit) => unit.name)).toEqual(['u1-base-print-task-config'])
  expect(host.download(host.inspect(identity.releaseTag)!.assets.find((asset) => asset.name.endsWith('.b3'))!)).toEqual(verifiedBytes)
  expect(readFileSync(selectedPackage)).toEqual(verifiedBytes)
  expect(host.releases.size).toBe(1)
})

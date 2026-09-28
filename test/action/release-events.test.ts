// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { generateKey } from 'openpgp'
import { expect, it } from 'vitest'
import { runPipeline } from '../../src/core/pipeline.js'
import { actionIdentity } from '../../src/action/release-inputs.js'
import { prepareEvidence, verifyEvidence } from '../../src/action/release-evidence.js'
import { verifyApprovedPreparedRun } from '../../src/action/verify-approved-prepared-run.js'
import { publishUnits } from '../../src/action/publish-units.js'
import { FixtureHost } from './release-fixtures.js'
import { fixtureFile } from './consumer-rehearsal-fixtures.js'
import { consumerCheckout, contextCli, eventEnvironment, git, mockGithub } from './release-event-fixtures.js'
import type { PreparedReceipt } from '../../src/action/prepared-receipt.js'
import type { BuildRequest } from '../../src/core/types.js'

const scenarios = ['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'].flatMap((repo) => ['draft', 'prerelease', 'live'].map((kind) => ({ repo, kind: kind as 'draft' | 'prerelease' | 'live', version: kind === 'live' ? '1.0.0' : '1.0.0-pre' })))

function preparationMetadata(receipt: PreparedReceipt) {
  const run = { id: receipt.runId, run_attempt: receipt.runAttempt, head_sha: receipt.sourceCommit, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success', repository: { id: 7, full_name: receipt.repository }, head_repository: { id: 7, full_name: receipt.repository } }
  const artifact = { id: receipt.artifactId, name: 'verified-unit-outputs', expired: false, digest: receipt.artifactDigest, workflow_run: { id: receipt.runId, head_sha: receipt.sourceCommit, repository_id: 7, head_repository_id: 7 } }
  return { [`repos/${receipt.repository}/actions/runs/${receipt.runId}/attempts/${receipt.runAttempt}`]: run, [`repos/${receipt.repository}/actions/artifacts/${receipt.artifactId}`]: artifact }
}

function stageSource(repo: string, root: string, env: NodeJS.ProcessEnv): void {
  if (repo.startsWith('plugins/')) contextCli(root, 'stage-plugin-source', env)
  else execFileSync('sh', ['scripts/stage-package.sh'], { cwd: root })
  if (repo === 'daemon') fixtureFile(root, 'dist/package/bespok3d-daemon/files/wheels/fixture.whl', 'baked fixture dependency')
}

it.each(scenarios)('$repo $kind prepares, receipts and publishes only the exact archived package', async ({ repo, kind, version }) => {
  const fixture = consumerCheckout(repo, version)
  const values = { inputs: { 'prospective-tag': fixture.tag, 'selected-ids': fixture.name, 'expected-source-sha': fixture.commit, 'release-kind': kind, publish: false }, github: { event_name: 'workflow_dispatch', ref_type: 'branch', ref_name: 'candidate', repository: 'fixture/consumer' }, steps: {} }
  const env = eventEnvironment(repo, fixture, values)
  expect(contextCli(fixture.root, 'plan', env)).toMatchObject({ 'selected-ids': fixture.name, 'prepared-only': 'false' })
  stageSource(repo, fixture.root, env)
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
  const request: BuildRequest = { unit: 'repo', sourceDir: join(fixture.root, 'dist/package'), outputDir: join(fixture.root, 'dist'), identity: { atomRepo: 'fixture/consumer' }, signingKey: privateKey, selectedIds: [fixture.name], releaseKind: kind }
  const built = await runPipeline(request)
  await prepareEvidence(request, built.atoms, actionIdentity({ ...env, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true' }))
  const packagePath = join(request.outputDir, `${fixture.name}-${version}.b3`)
  const preparedBytes = readFileSync(packagePath)
  execFileSync('tar', ['-czf', 'verified-unit-outputs.tar.gz', 'dist'], { cwd: fixture.root })
  contextCli(fixture.root, 'receipt', { ...env, B3D_ARTIFACT_ID: '501', B3D_ARTIFACT_DIGEST: 'a'.repeat(64) })
  const receipt = JSON.parse(readFileSync(join(fixture.root, 'prepared-release-receipt.json'), 'utf8')) as PreparedReceipt
  rmSync(request.outputDir, { recursive: true })
  git(fixture.root, ['tag', '-a', fixture.tag, '-F', 'prepared-release-tag-message.txt'])
  const github = mockGithub(preparationMetadata(receipt))
  const pushValues = { inputs: {}, github: { event_name: 'push', ref_type: 'tag', ref_name: fixture.tag, repository: 'fixture/consumer' }, steps: {} }
  const push = eventEnvironment(repo, fixture, pushValues, github)
  expect(contextCli(fixture.root, 'plan', push)).toMatchObject({ publish: 'true', 'prepared-only': 'true', 'prepared-artifact-id': '501' })
  contextCli(fixture.root, 'restore', push)
  const identity = actionIdentity({ ...push, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true' })
  verifyApprovedPreparedRun(request.outputDir, identity, push)
  const evidence = await verifyEvidence(request, identity)
  const host = new FixtureHost()
  publishUnits(evidence, kind, request.outputDir, 'public', host)
  expect(evidence.units.map((unit) => unit.name)).toEqual([fixture.name])
  expect(host.download(host.inspect(fixture.tag)!.assets.find((asset) => asset.name.endsWith('.b3'))!)).toEqual(preparedBytes)
  expect(readFileSync(packagePath)).toEqual(preparedBytes)
  if (kind !== 'draft') return
  const promotion = eventEnvironment(repo, fixture, { inputs: { ...values.inputs, publish: true, 'release-kind': 'prerelease', 'prepared-receipt': JSON.stringify(receipt) }, github: values.github, steps: {} }, github)
  expect(contextCli(fixture.root, 'plan', promotion)['prepared-artifact-id']).toBe('501')
  await verifyEvidence({ ...request, releaseKind: 'prerelease' }, actionIdentity({ ...promotion, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true' }))
  publishUnits(evidence, 'prerelease', request.outputDir, 'public', host)
  expect(readFileSync(packagePath)).toEqual(preparedBytes)
})

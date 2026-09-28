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
import { consumerCheckout, contextCli, git, mockGithub } from './release-event-fixtures.js'
import type { PreparedReceipt } from '../../src/action/prepared-receipt.js'

const builderCommit = '2'.repeat(40)

it('a multi-plugin repo prepares one selected package and publishes its exact archived bytes with a verified receipt', async () => {
  const fixture = consumerCheckout('plugins/networking', '1.0.0-pre')
  const base = { ...process.env, GITHUB_SHA: fixture.commit, GITHUB_REPOSITORY: 'fixture/consumer', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'candidate', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: join(fixture.root, 'github-output'), B3D_TAG_PREFIX: 'plugin-{unit}', B3D_MANIFEST_PATH: '', B3D_PROSPECTIVE_TAG: fixture.tag, B3D_SELECTED_IDS: fixture.name, B3D_EXPECTED_SOURCE: fixture.commit, B3D_RELEASE_KIND: 'draft', B3D_PUBLISH: 'false', B3D_BUILDER_COMMIT: builderCommit, B3D_REGISTER_COMMIT: builderCommit }
  const selected = contextCli(fixture.root, 'plan', base)
  expect(selected).toMatchObject({ 'selected-ids': fixture.name, 'prepared-only': 'false' })
  contextCli(fixture.root, 'stage-plugin-source', base)
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture' }], format: 'armored' })
  const request = { unit: 'repo' as const, sourceDir: join(fixture.root, 'dist/package'), outputDir: join(fixture.root, 'dist'), identity: { atomRepo: 'fixture/consumer' }, signingKey: privateKey, selectedIds: [fixture.name], releaseKind: 'draft' as const }
  const built = await runPipeline(request)
  await prepareEvidence(request, built.atoms, actionIdentity({ ...base, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true' }))
  const packageBytes = readFileSync(join(fixture.root, 'dist/selected-1.0.0-pre.b3'))
  execFileSync('tar', ['-czf', 'verified-unit-outputs.tar.gz', 'dist'], { cwd: fixture.root })
  contextCli(fixture.root, 'receipt', { ...base, B3D_ARTIFACT_ID: '501', B3D_ARTIFACT_DIGEST: 'a'.repeat(64) })
  const receipt = JSON.parse(readFileSync(join(fixture.root, 'prepared-release-receipt.json'), 'utf8')) as PreparedReceipt
  rmSync(join(fixture.root, 'dist'), { recursive: true })
  git(fixture.root, ['tag', '-a', fixture.tag, '-F', 'prepared-release-tag-message.txt'])
  const run = { id: 101, run_attempt: 1, head_sha: fixture.commit, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success', repository: { id: 7, full_name: receipt.repository }, head_repository: { id: 7, full_name: receipt.repository } }
  const artifact = { id: 501, name: 'verified-unit-outputs', expired: false, digest: receipt.artifactDigest, workflow_run: { id: 101, head_sha: fixture.commit, repository_id: 7, head_repository_id: 7 } }
  const github = mockGithub({ 'repos/fixture/consumer/actions/runs/101/attempts/1': run, 'repos/fixture/consumer/actions/artifacts/501': artifact })
  const push = { ...base, PATH: `${github}:${process.env.PATH}`, GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: fixture.tag, B3D_PUBLISH: 'true' }
  expect(contextCli(fixture.root, 'plan', push)['prepared-artifact-id']).toBe('501')
  contextCli(fixture.root, 'restore', push)
  const identity = actionIdentity({ ...push, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true' })
  verifyApprovedPreparedRun(request.outputDir, identity, push)
  const evidence = await verifyEvidence(request, identity)
  const host = new FixtureHost()
  publishUnits(evidence, 'draft', request.outputDir, 'public', host)
  expect(evidence.units.map((unit) => unit.name)).toEqual(['selected'])
  expect(host.download(host.inspect(fixture.tag)!.assets.find((asset) => asset.name.endsWith('.b3'))!)).toEqual(packageBytes)
  expect(host.releases.size).toBe(1)
})

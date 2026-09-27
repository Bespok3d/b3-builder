// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { generateKey } from 'openpgp'
import { fixtureFile } from './consumer-rehearsal-fixtures.js'
import { expect, it } from 'vitest'
import { publishUnits } from '../../src/action/publish-units.js'
import { FixtureHost } from './release-fixtures.js'
import { runPipeline } from '../../src/core/pipeline.js'
import { actionIdentity } from '../../src/action/release-inputs.js'
import { prepareEvidence, verifyEvidence } from '../../src/action/release-evidence.js'
import type { PreparedReceipt } from '../../src/action/prepared-receipt.js'
import { consumerCheckout, contextCli, eventEnvironment, git, mockGithub, releaseSteps, runs, stepInputs } from './release-event-fixtures.js'
import type { EventValues, WorkflowStep } from './release-event-fixtures.js'
import type { BuildRequest } from '../../src/core/types.js'

const consumers = ['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'].flatMap((repo) => [{ version: '1.0.0-pre', kind: 'draft' }, { version: '1.0.0-pre', kind: 'prerelease' }, { version: '1.0.0', kind: 'live' }].map(({ version, kind }) => ({ repo, version, kind })))
it.each(consumers)('$repo $kind branch preparation and actual push reuse the named artifact without staging, baking or packing', async ({ repo, version, kind }) => {
  const prepared = await prepareConsumer(repo, version, kind)
  const published = await pushPrepared(prepared)
  await promotePrepared(prepared, published)
})

async function prepareConsumer(repo: string, version: string, kind: string) {
  const fixture = consumerCheckout(repo, version)
  const values: EventValues = { inputs: { 'prospective-tag': fixture.tag, 'selected-ids': fixture.name, 'expected-source-sha': fixture.commit, 'release-kind': kind, publish: false }, github: { event_name: 'workflow_dispatch', ref_type: 'branch', ref_name: 'candidate-branch', repository: 'fixture/consumer' }, steps: {} }
  const env = eventEnvironment(repo, fixture, values)
  values.steps['release-selection'] = { outputs: contextCli(fixture.root, 'plan', env) }
  expect(git(fixture.root, ['tag', '--list'])).toBe('')
  expect(values.steps['release-selection'].outputs['prepared-only']).toBe('false')
  const steps = releaseSteps(repo)
  runRealGuard(steps, fixture.root, fixture.tag)
  stageActualConsumer(steps, fixture.root, env, values)
  const buildInputs = stepInputs(steps.find((step) => step.uses?.startsWith('Bespok3d/b3-builder@'))!, values)
  const request = await preparedBuild(fixture, env, buildInputs)
  execFileSync('tar', ['-czf', 'verified-unit-outputs.tar.gz', 'dist'], { cwd: fixture.root })
  contextCli(fixture.root, 'receipt', { ...env, B3D_ARTIFACT_ID: '501', B3D_ARTIFACT_DIGEST: 'a'.repeat(64) })
  const receipt = JSON.parse(readFileSync(join(fixture.root, 'prepared-release-receipt.json'), 'utf8')) as PreparedReceipt
  const expectedPackage = readFileSync(join(fixture.root, `dist/${fixture.name}-${fixture.version}.b3`))
  const github = mockGithub(preparationResponses(receipt))
  return { repo, fixture, values, env, steps, request, receipt, expectedPackage, github }
}
async function pushPrepared(prepared: Awaited<ReturnType<typeof prepareConsumer>>) {
  const { repo, fixture, values, steps, request, expectedPackage, github } = prepared
  git(fixture.root, ['tag', '-a', fixture.tag, '-F', 'prepared-release-tag-message.txt'])
  rmSync(join(fixture.root, 'dist'), { recursive: true })
  values.inputs = {}
  values.github = { ...values.github, event_name: 'push', ref_type: 'tag', ref_name: fixture.tag }
  const pushEnv = eventEnvironment(repo, fixture, values, github)
  values.steps['release-selection'] = { outputs: contextCli(fixture.root, 'plan', pushEnv) }
  assertPushDecisions(steps, values)
  runRealGuard(steps, fixture.root, fixture.tag)
  contextCli(fixture.root, 'restore', pushEnv)
  const evidence = await verifyEvidence(request, actionIdentity({ ...pushEnv, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true', B3D_PUBLISH: 'true' }))
  expect(readFileSync(join(fixture.root, `dist/${fixture.name}-${fixture.version}.b3`))).toEqual(expectedPackage)
  const host = new FixtureHost()
  publishUnits(evidence, request.releaseKind!, request.outputDir, 'public', host)
  expect([...host.releases.keys()]).toEqual([fixture.tag])
  const releaseId = host.releases.get(fixture.tag)!.id
  const effects = [...host.effects]
  publishUnits(evidence, request.releaseKind!, request.outputDir, 'public', host)
  expect(host.effects).toEqual(effects)
  expect(contextCli(fixture.root, 'plan', pushEnv)['prepared-artifact-id']).toBe('501')
  expect(readFileSync(join(github, 'calls'), 'utf8')).not.toMatch(/\/102|\/502/)
  return { host, evidence, releaseId }
}
async function promotePrepared(prepared: Awaited<ReturnType<typeof prepareConsumer>>, published: Awaited<ReturnType<typeof pushPrepared>>): Promise<void> {
  const { repo, fixture, values, receipt, request, expectedPackage, github } = prepared
  const { host, evidence, releaseId } = published
  if (request.releaseKind !== 'draft') return
  values.github.event_name = 'workflow_dispatch'
  values.github.ref_type = 'branch'
  values.inputs = { 'prospective-tag': fixture.tag, 'selected-ids': fixture.name, 'expected-source-sha': fixture.commit, 'release-kind': 'prerelease', publish: true, 'prepared-receipt': JSON.stringify(receipt) }
  const promotionEnv = eventEnvironment(repo, fixture, values, github)
  expect(contextCli(fixture.root, 'plan', promotionEnv)).toMatchObject({ 'prepared-only': 'true', 'release-kind': 'prerelease', 'prepared-artifact-id': '501' })
  await verifyEvidence({ ...request, releaseKind: 'prerelease' }, actionIdentity({ ...promotionEnv, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true', B3D_PUBLISH: 'true' }))
  publishUnits(evidence, 'prerelease', request.outputDir, 'public', host)
  expect(host.releases.get(fixture.tag)!.id).toBe(releaseId)
  expect(readFileSync(join(fixture.root, `dist/${fixture.name}-${fixture.version}.b3`))).toEqual(expectedPackage)
}

function runRealGuard(steps: WorkflowStep[], root: string, tag: string): void {
  const guard = steps.find((step) => step.run?.includes('tag_version_guard'))!
  expect(guard.env?.RELEASE_TAG).toBe('${{ steps.release-selection.outputs.release-tag }}')
  execFileSync('bash', ['-euc', guard.run!], { cwd: root, env: { ...process.env, RELEASE_TAG: tag }, stdio: 'pipe' })
}
function stageActualConsumer(steps: WorkflowStep[], root: string, env: NodeJS.ProcessEnv, values: EventValues): void {
  const staging = steps.find((step) => step.run?.includes('stage-package.sh') || step.run?.includes('stage-plugin-source'))!
  expect(runs(staging, values)).toBe(true)
  if (staging.run!.includes('stage-plugin-source')) contextCli(root, 'stage-plugin-source', env)
  else execFileSync('bash', ['-euc', staging.run!], { cwd: root, stdio: 'pipe' })
}
async function preparedBuild(fixture: ReturnType<typeof consumerCheckout>, env: NodeJS.ProcessEnv, inputs: Record<string, string>): Promise<BuildRequest> {
  const { privateKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'fixture event rehearsal' }], format: 'armored' })
  writeFileSync(join(fixture.root, `dist/package/${fixture.name}/files/baked-payload`), 'prepared compiled bytes, no publication rebuild')
  if (fixture.name === 'bespok3d-daemon') fixtureFile(fixture.root, `dist/package/${fixture.name}/files/wheels/fixture.whl`, 'identical fixture wheel bytes')
  const request: BuildRequest = { unit: 'repo', sourceDir: join(fixture.root, inputs.source!), outputDir: join(fixture.root, inputs.out || 'dist'), identity: { atomRepo: inputs['atom-repo']! }, releaseKind: inputs['release-kind'] as 'draft' | 'prerelease' | 'live', selectedIds: inputs['selected-ids']!.split(' '), signingKey: privateKey }
  const built = await runPipeline(request)
  await prepareEvidence(request, built.atoms, actionIdentity({ ...env, B3D_RELEASE_TAG: fixture.tag, B3D_REQUIRE_SIGNATURE: 'true', B3D_PUBLISH: 'false' }))
  return request
}
function assertPushDecisions(steps: WorkflowStep[], values: EventValues): void {
  const output = values.steps['release-selection']!.outputs
  expect(output).toMatchObject({ publish: 'true', 'prepared-only': 'true', 'prepared-run-id': '101', 'prepared-artifact-id': '501' })
  expect(steps.filter((step) => step.run?.includes('stage-package.sh') || step.run?.includes('stage-plugin-source')).every((step) => !runs(step, values))).toBe(true)
  const download = steps.find((step) => step.uses === 'actions/download-artifact@v4')!
  expect(runs(download, values)).toBe(true)
  expect(stepInputs(download, values)['artifact-ids']).toBe('501')
  const build = steps.find((step) => step.uses?.startsWith('Bespok3d/b3-builder@'))!
  const buildValues = { ...values, inputs: stepInputs(build, values) }
  const action = parseDocument(readFileSync(resolve(import.meta.dirname, '../../action.yml'), 'utf8')).toJS()
  const producerSteps = (action.runs.steps as WorkflowStep[]).filter((step) => ['Build and verify selected release outputs', 'Test each plugin', 'Set up Docker buildx (for docker-c / docker-ko bakes)'].includes(step.name ?? ''))
  expect(producerSteps).toHaveLength(3)
  expect(producerSteps.every((step) => !runs(step, buildValues))).toBe(true)
}
export function preparationResponses(receipt: PreparedReceipt): Record<string, unknown> {
  const run = { id: 101, run_attempt: 1, head_sha: receipt.sourceCommit, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success', repository: { id: 7, full_name: receipt.repository }, head_repository: { id: 7, full_name: receipt.repository } }
  const artifact = { id: 501, name: 'verified-unit-outputs', expired: false, digest: receipt.artifactDigest, workflow_run: { id: 101, head_sha: receipt.sourceCommit, repository_id: 7, head_repository_id: 7 } }
  return { [`repos/${receipt.repository}/actions/runs/101/attempts/1`]: run, [`repos/${receipt.repository}/actions/artifacts/501`]: artifact, [`repos/${receipt.repository}/actions/runs/102/attempts/1`]: { ...run, id: 102 }, [`repos/${receipt.repository}/actions/artifacts/502`]: { ...artifact, id: 502 } }
}

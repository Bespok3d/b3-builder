// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { consumerContext } from './release-context.js'
import type { ReleaseContext } from './release-context.js'
import { assertPreparationMetadata, assertReceiptContext, parseReceipt, tagReceiptMessage } from './prepared-receipt.js'
import type { PreparedReceipt, PreparationRun, PreparationArtifact } from './prepared-receipt.js'
import { assertPreparedEvidence, restorePreparedArtifact } from './prepared-artifact.js'
import { discoverRepoSources } from '../core/build/discovery.js'
import { sha256 } from './verify-package.js'
import type { ReleaseEvidence } from './release-evidence.js'

const CONTEXT_FILE = '.b3-release-context.json'
interface SavedContext { context: ReleaseContext; receipt?: PreparedReceipt }
function environment(name: string): string { return process.env[name] ?? '' }
function git(args: string[]): string { return execFileSync('git', args, { encoding: 'utf8' }).trim() }
function output(name: string, value: string): void { appendFileSync(environment('GITHUB_OUTPUT'), `${name}=${value}\n`) }
function metadata<T>(path: string): T { return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' })) as T }

function plan(): void {
  const sourceCommit = git(['rev-parse', 'HEAD'])
  if (sourceCommit !== environment('GITHUB_SHA')) throw new Error('checkout/event source mismatch')
  const pushedReceipt = environment('GITHUB_EVENT_NAME') === 'push' ? parseReceipt(tagContents(environment('GITHUB_REF_NAME'), sourceCommit)) : undefined
  const context = consumerContext({ eventName: environment('GITHUB_EVENT_NAME'), refType: environment('GITHUB_REF_TYPE'), refName: environment('GITHUB_REF_NAME'), repository: environment('GITHUB_REPOSITORY'), sourceCommit, manifestPath: environment('B3D_MANIFEST_PATH'), tagPrefix: environment('B3D_TAG_PREFIX'), prospectiveTag: environment('B3D_PROSPECTIVE_TAG'), selectedIds: environment('B3D_SELECTED_IDS'), expectedSource: environment('B3D_EXPECTED_SOURCE'), requestedKind: pushedReceipt?.releaseKind ?? environment('B3D_RELEASE_KIND'), publish: environment('B3D_PUBLISH') === 'true', builderCommit: environment('B3D_BUILDER_COMMIT'), registerCommit: environment('B3D_REGISTER_COMMIT') }, process.cwd())
  git(['check-ref-format', `refs/tags/${context.tag}`])
  const receipt = context.preparedOnly ? publicationReceipt(context, pushedReceipt) : undefined
  if (!context.preparedOnly && environment('B3D_PREPARED_RECEIPT')) throw new Error('preparation cannot silently ignore a supplied receipt')
  writeFileSync(CONTEXT_FILE, JSON.stringify({ context, receipt }))
  const values = { 'release-tag': context.tag, 'selected-ids': context.selectedIds.join(' '), 'release-kind': context.releaseKind, publish: String(context.publish), 'prepared-only': String(context.preparedOnly), 'prepared-run-id': String(receipt?.runId ?? ''), 'prepared-artifact-id': String(receipt?.artifactId ?? '') }
  Object.entries(values).forEach(([name, value]) => output(name, value))
}
function publicationReceipt(context: ReleaseContext, pushedReceipt?: PreparedReceipt): PreparedReceipt {
  const receipt = pushedReceipt ?? parseReceipt(environment('B3D_PREPARED_RECEIPT'))
  assertReceiptContext(receipt, context)
  const run = metadata<PreparationRun>(`repos/${context.repository}/actions/runs/${receipt.runId}/attempts/${receipt.runAttempt}`)
  const artifact = metadata<PreparationArtifact>(`repos/${context.repository}/actions/artifacts/${receipt.artifactId}`)
  assertPreparationMetadata(receipt, run, artifact)
  return receipt
}
function tagContents(tag: string, sourceCommit: string): string {
  const ref = `refs/tags/${tag}`
  if (git(['cat-file', '-t', ref]) !== 'tag' || git(['rev-parse', `${ref}^{commit}`]) !== sourceCommit) throw new Error('tag must be annotated at the exact prepared source commit')
  const contents = git(['for-each-ref', '--format=%(contents)', ref])
  if (!contents.startsWith('B3D-Prepared-Release\n')) throw new Error('annotated tag has no prepared release receipt')
  return contents
}
function saved(): SavedContext { return JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as SavedContext }
function restore(): void {
  const { context, receipt } = saved()
  if (!context.preparedOnly || !receipt) throw new Error('no exact artifact selected for restoration')
  restorePreparedArtifact(process.cwd(), receipt)
}
function stagePluginSources(): void {
  if (saved().context.preparedOnly) throw new Error('publication must not stage or rebuild sources')
  const sources = discoverRepoSources(process.cwd())
  mkdirSync('dist/package', { recursive: true })
  sources.forEach((source) => cpSync(source.dir, resolve('dist/package', basename(source.dir)), { recursive: true }))
}
function receipt(): void {
  const { context } = saved()
  if (context.publish || context.preparedOnly) throw new Error('only nonpublishing preparation creates an approval receipt')
  const bytes = readFileSync('dist/release-evidence.json')
  const evidence = JSON.parse(bytes.toString('utf8')) as ReleaseEvidence
  if (!evidence.preparation || evidence.preparation.tag !== context.tag) throw new Error('prepared evidence lacks prospective tag identity')
  const { publish: _publish, preparedOnly: _preparedOnly, ...identity } = context
  const prepared = parseReceipt(JSON.stringify({ ...identity, schema: 1, runId: Number(environment('GITHUB_RUN_ID')), runAttempt: Number(environment('GITHUB_RUN_ATTEMPT')), artifactId: Number(environment('B3D_ARTIFACT_ID')), artifactDigest: `sha256:${environment('B3D_ARTIFACT_DIGEST').replace(/^sha256:/, '')}`, archiveSha256: sha256(readFileSync('verified-unit-outputs.tar.gz')), evidenceSha256: sha256(bytes) }))
  assertPreparedEvidence(prepared, bytes)
  writeFileSync('prepared-release-receipt.json', `${JSON.stringify(prepared, null, 2)}\n`)
  writeFileSync('prepared-release-tag-message.txt', tagReceiptMessage(prepared))
}
try {
  const operations: Record<string, () => void> = { plan, restore, receipt, 'stage-plugin-source': stagePluginSources }
  const operation = operations[process.argv[2] ?? '']
  if (!operation) throw new Error('operation must be plan, restore, receipt or stage-plugin-source')
  operation()
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

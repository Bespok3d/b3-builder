// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { assertPreparationMetadata, assertReceiptContext, parseReceipt, tagReceiptMessage } from '../../src/action/prepared-receipt.js'
import type { PreparedReceipt, PreparationArtifact, PreparationRun } from '../../src/action/prepared-receipt.js'
import type { ReleaseContext } from '../../src/action/release-context.js'

const context: ReleaseContext = { repository: 'fixture/consumer', sourceCommit: '1'.repeat(40), tag: 'plugin-selected-v1.0.0-pre', selectedIds: ['selected'], releaseKind: 'draft', builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), publish: true, preparedOnly: true }
const receipt: PreparedReceipt = { ...context, schema: 1, runId: 101, runAttempt: 1, artifactId: 501, artifactDigest: `sha256:${'a'.repeat(64)}`, archiveSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64) }
const run: PreparationRun = { id: 101, run_attempt: 1, head_sha: context.sourceCommit, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success', repository: { id: 7, full_name: context.repository }, head_repository: { id: 7, full_name: context.repository } }
const artifact: PreparationArtifact = { id: 501, name: 'verified-unit-outputs', expired: false, digest: receipt.artifactDigest, workflow_run: { id: 101, head_sha: context.sourceCommit, repository_id: 7, head_repository_id: 7 } }

it('round trips the tag receipt and permits only the same candidate draft to prerelease transition', () => {
  expect(parseReceipt(tagReceiptMessage(receipt))).toEqual(receipt)
  expect(() => assertReceiptContext(receipt, context)).not.toThrow()
  expect(() => assertReceiptContext(receipt, { ...context, releaseKind: 'prerelease' })).not.toThrow()
  expect(() => assertReceiptContext(receipt, { ...context, releaseKind: 'live' })).toThrow('kind mismatch')
  expect(() => assertPreparationMetadata(receipt, run, artifact)).not.toThrow()
})
it.each(['repository', 'sourceCommit', 'tag', 'builderCommit', 'registerCommit'] as const)('refuses a different approved %s before artifact download', (field) => {
  expect(() => assertReceiptContext({ ...receipt, [field]: 'unexpected' }, context)).toThrow('mismatch')
})
it('refuses changed selection and malformed immutable artifact identities', () => {
  expect(() => assertReceiptContext({ ...receipt, selectedIds: ['unrelated'] }, context)).toThrow('mismatch')
  ;['runId', 'runAttempt', 'artifactId', 'schema', 'artifactDigest', 'evidenceSha256', 'archiveSha256'].forEach((field) => {
    expect(() => parseReceipt(JSON.stringify({ ...receipt, [field]: 'bad' }))).toThrow()
  })
})
it.each([
  { id: 102 }, { run_attempt: 2 }, { event: 'push' }, { path: '.github/workflows/other.yml' },
  { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: '4'.repeat(40) },
  { repository: { id: 8, full_name: 'another/repo' } }, { head_repository: { id: 8, full_name: 'another/fork' } },
])('rejects an unapproved or unsuccessful preparation attempt: %j', (changed) => {
  expect(() => assertPreparationMetadata(receipt, { ...run, ...changed }, artifact)).toThrow()
})
it.each([
  { id: 502 }, { name: 'other-artifact' }, { expired: true }, { digest: `sha256:${'d'.repeat(64)}` },
  { workflow_run: { ...artifact.workflow_run, id: 102 } }, { workflow_run: { ...artifact.workflow_run, head_sha: '4'.repeat(40) } },
  { workflow_run: { ...artifact.workflow_run, repository_id: 8 } }, { workflow_run: { ...artifact.workflow_run, head_repository_id: 8 } },
])('rejects a missing, replaced, expired or unrelated artifact: %j', (changed) => {
  expect(() => assertPreparationMetadata(receipt, run, { ...artifact, ...changed })).toThrow()
})

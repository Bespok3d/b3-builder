// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { restorePreparedArtifact } from '../../src/action/prepared-artifact.js'
import type { PreparedReceipt } from '../../src/action/prepared-receipt.js'
import { sha256 } from '../../src/action/verify-package.js'
import { verifyApprovedPreparedRun } from '../../src/action/verify-approved-prepared-run.js'

function preparedArchive(): { root: string; receipt: PreparedReceipt } {
  const root = mkdtempSync(join(tmpdir(), 'restore-artifact-'))
  mkdirSync(join(root, 'dist'))
  const evidence = { repository: 'fixture/repo', sourceCommit: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), kind: 'live', units: [{ name: 'selected' }], preparation: { tag: 'plugin-selected-v1.0.0', runId: 101, runAttempt: 1 } }
  const bytes = Buffer.from(JSON.stringify(evidence))
  writeFileSync(join(root, 'dist/release-evidence.json'), bytes)
  execFileSync('tar', ['-czf', 'verified-unit-outputs.tar.gz', 'dist'], { cwd: root })
  const receipt: PreparedReceipt = { schema: 1, repository: evidence.repository, sourceCommit: evidence.sourceCommit, builderCommit: evidence.builderCommit, registerCommit: evidence.registerCommit, tag: evidence.preparation.tag, selectedIds: ['selected'], releaseKind: 'live', runId: 101, runAttempt: 1, artifactId: 501, artifactDigest: `sha256:${'a'.repeat(64)}`, archiveSha256: sha256(readFileSync(join(root, 'verified-unit-outputs.tar.gz'))), evidenceSha256: sha256(bytes) }
  rmSync(join(root, 'dist'), { recursive: true })
  return { root, receipt }
}
it('refuses modified archive bytes before extracting anything', () => {
  const { root, receipt } = preparedArchive()
  writeFileSync(join(root, 'verified-unit-outputs.tar.gz'), 'changed download')
  expect(() => restorePreparedArtifact(root, receipt)).toThrow('archive digest mismatch')
  expect(existsSync(join(root, 'dist'))).toBe(false)
})
it.each([
  { evidenceSha256: 'f'.repeat(64) }, { runId: 102 }, { runAttempt: 2 }, { tag: 'other' },
  { selectedIds: ['unrelated'] }, { builderCommit: 'f'.repeat(40) }, { releaseKind: 'draft' as const },
])('refuses prepared evidence that differs from the approved receipt: %j', (changed) => {
  const { root, receipt } = preparedArchive()
  expect(() => restorePreparedArtifact(root, { ...receipt, ...changed })).toThrow()
})
it('restores the exact approved evidence after archive validation', () => {
  const { root, receipt } = preparedArchive()
  restorePreparedArtifact(root, receipt)
  expect(sha256(readFileSync(join(root, 'dist/release-evidence.json')))).toBe(receipt.evidenceSha256)
})

it('refuses prepared-output publication without a receipt, and binds an approved receipt to the publisher commit', () => {
  const { root, receipt } = preparedArchive()
  restorePreparedArtifact(root, receipt)
  const identity = { sourceCommit: receipt.sourceCommit, builderCommit: receipt.builderCommit, registerCommit: receipt.registerCommit, releaseTag: receipt.tag, requireSignature: true }
  writeFileSync(join(root, '.b3-release-context.json'), JSON.stringify({ context: { ...receipt, publish: true, preparedOnly: true } }))
  expect(() => verifyApprovedPreparedRun(join(root, 'dist'), identity)).toThrow('requires an approved receipt')
  writeFileSync(join(root, '.b3-release-context.json'), JSON.stringify({ context: { ...receipt, publish: true, preparedOnly: true }, receipt }))
  expect(() => verifyApprovedPreparedRun(join(root, 'dist'), { ...identity, builderCommit: 'f'.repeat(40) })).toThrow('differs from publication tooling')
})

it.each([
  { builderCommit: 'f'.repeat(40) }, { registerCommit: 'f'.repeat(40) }, { sourceCommit: 'f'.repeat(40) },
  { repository: 'different/repository' }, { releaseKind: 'draft' as const }, { selectedIds: ['unrelated'] },
  { runId: 102 }, { runAttempt: 2 },
])('refuses to emit approval files when preparation context/evidence differ: %j', (changed) => {
  const { root, receipt } = preparedArchive()
  restorePreparedArtifact(root, receipt)
  writeFileSync(join(root, '.b3-release-context.json'), JSON.stringify({ context: { ...receipt, ...changed, publish: false, preparedOnly: false } }))
  const environment = { ...process.env, GITHUB_RUN_ID: String(changed.runId ?? 101), GITHUB_RUN_ATTEMPT: String(changed.runAttempt ?? 1), B3D_ARTIFACT_ID: '501', B3D_ARTIFACT_DIGEST: 'a'.repeat(64) }
  expect(() => execFileSync(process.execPath, [new URL('../../dist/action/release-context-main.js', import.meta.url).pathname, 'receipt'], { cwd: root, env: environment, stdio: 'pipe' })).toThrow()
  expect(existsSync(join(root, 'prepared-release-receipt.json'))).toBe(false)
  expect(existsSync(join(root, 'prepared-release-tag-message.txt'))).toBe(false)
})

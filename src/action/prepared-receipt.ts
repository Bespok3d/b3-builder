// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReleaseContext } from './release-context.js'

export interface PreparedReceipt extends Omit<ReleaseContext, 'publish' | 'preparedOnly'> {
  schema: 1; runId: number; runAttempt: number; artifactId: number; artifactDigest: string
  archiveSha256: string; evidenceSha256: string
}
export interface PreparationRun {
  id: number; run_attempt: number; head_sha: string; event: string; path: string; status: string; conclusion: string
  repository: { id: number; full_name: string }; head_repository: { id: number; full_name: string }
}
export interface PreparationArtifact {
  id: number; name: string; expired: boolean; digest: string
  workflow_run: { id: number; head_sha: string; repository_id: number; head_repository_id: number }
}
export const RECEIPT_PREFIX = 'B3D-Prepared-Release\n'
export function parseReceipt(message: string): PreparedReceipt {
  const content = message.startsWith(RECEIPT_PREFIX) ? message.slice(RECEIPT_PREFIX.length) : message
  const receipt = JSON.parse(content) as PreparedReceipt
  if (receipt.schema !== 1 || !Array.isArray(receipt.selectedIds)) throw new Error('invalid prepared receipt schema')
  ;[receipt.runId, receipt.runAttempt, receipt.artifactId].forEach((identity) => { if (!Number.isSafeInteger(identity) || identity < 1) throw new Error('invalid prepared artifact identity') })
  ;[receipt.archiveSha256, receipt.evidenceSha256].forEach((digest) => { if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new Error('invalid prepared digest') })
  if (!/^sha256:[0-9a-f]{64}$/.test(receipt.artifactDigest)) throw new Error('invalid artifact digest')
  return receipt
}
export function tagReceiptMessage(receipt: PreparedReceipt): string { return `${RECEIPT_PREFIX}${JSON.stringify(receipt)}\n` }

export function assertReceiptContext(receipt: PreparedReceipt, context: ReleaseContext): void {
  const keys = ['repository', 'sourceCommit', 'tag', 'builderCommit', 'registerCommit'] as const
  if (keys.some((key) => receipt[key] !== context[key]) || JSON.stringify(receipt.selectedIds) !== JSON.stringify(context.selectedIds)) throw new Error('prepared receipt source/tag/selection/tooling mismatch')
  if (receipt.releaseKind !== context.releaseKind && !(receipt.releaseKind === 'draft' && context.releaseKind === 'prerelease')) throw new Error('prepared receipt kind mismatch')
}
export function assertPreparationMetadata(receipt: PreparedReceipt, run: PreparationRun, artifact: PreparationArtifact): void {
  if (run.id !== receipt.runId || run.run_attempt !== receipt.runAttempt || run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/release.yml' || run.status !== 'completed' || run.conclusion !== 'success') throw new Error('not the successful preparation workflow attempt')
  if (run.head_sha !== receipt.sourceCommit || run.repository.full_name !== receipt.repository || run.head_repository.full_name !== receipt.repository || run.head_repository.id !== run.repository.id) throw new Error('preparation run source/repository mismatch')
  const origin = artifact.workflow_run
  if (artifact.id !== receipt.artifactId || artifact.name !== 'verified-unit-outputs' || artifact.expired || artifact.digest !== receipt.artifactDigest) throw new Error('prepared artifact identity/digest/expiry mismatch')
  if (origin.id !== run.id || origin.head_sha !== receipt.sourceCommit || origin.repository_id !== run.repository.id || origin.head_repository_id !== run.repository.id) throw new Error('prepared artifact run/source/repository mismatch')
}

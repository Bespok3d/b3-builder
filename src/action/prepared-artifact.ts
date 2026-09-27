// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256 } from './verify-package.js'
import type { ReleaseEvidence } from './release-evidence.js'
import type { PreparedReceipt } from './prepared-receipt.js'

export function restorePreparedArtifact(root: string, receipt: PreparedReceipt): void {
  const archive = join(root, 'verified-unit-outputs.tar.gz')
  if (sha256(readFileSync(archive)) !== receipt.archiveSha256) throw new Error('prepared archive digest mismatch')
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  if (entries.some((path) => !/^dist(?:\/|$)/.test(path) || path.split('/').includes('..'))) throw new Error('unexpected prepared archive path')
  execFileSync('tar', ['-xzf', archive], { cwd: root })
  assertPreparedEvidence(receipt, readFileSync(join(root, 'dist/release-evidence.json')))
}

export function assertPreparedEvidence(receipt: PreparedReceipt, bytes: Buffer): void {
  if (sha256(bytes) !== receipt.evidenceSha256) throw new Error('prepared evidence digest mismatch')
  const evidence = JSON.parse(bytes.toString('utf8')) as ReleaseEvidence
  if (evidence.preparation?.runId !== receipt.runId || evidence.preparation.runAttempt !== receipt.runAttempt || evidence.preparation.tag !== receipt.tag) throw new Error('signed preparation identity mismatch')
  if (evidence.kind !== receipt.releaseKind || evidence.sourceCommit !== receipt.sourceCommit || evidence.repository !== receipt.repository || evidence.builderCommit !== receipt.builderCommit || evidence.registerCommit !== receipt.registerCommit || JSON.stringify(evidence.units.map((unit) => unit.name).sort()) !== JSON.stringify([...receipt.selectedIds].sort())) throw new Error('prepared evidence receipt mismatch')
}

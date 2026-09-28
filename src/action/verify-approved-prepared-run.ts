// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { assertPreparedEvidence } from './prepared-artifact.js'
import { assertPreparationMetadata, assertReceiptContext } from './prepared-receipt.js'
import type { PreparedReceipt, PreparationArtifact, PreparationRun } from './prepared-receipt.js'
import type { ReleaseContext } from './release-context.js'
import type { ReleaseIdentity } from './release-evidence.js'
import { sha256 } from './verify-package.js'

export function verifyApprovedPreparedRun(outputDir: string, identity: ReleaseIdentity, environment: NodeJS.ProcessEnv = process.env): void {
  const root = dirname(outputDir)
  const saved = JSON.parse(readFileSync(join(root, '.b3-release-context.json'), 'utf8')) as { context: ReleaseContext; receipt?: PreparedReceipt }
  if (!saved.receipt || !saved.context.preparedOnly || !saved.context.publish) throw new Error('publication from prepared output requires an approved receipt')
  assertReceiptContext(saved.receipt, saved.context)
  if (saved.context.sourceCommit !== identity.sourceCommit || saved.context.builderCommit !== identity.builderCommit || saved.context.registerCommit !== identity.registerCommit || saved.context.tag !== identity.releaseTag) throw new Error('prepared receipt differs from publication tooling/source/tag')
  if (sha256(readFileSync(join(root, 'verified-unit-outputs.tar.gz'))) !== saved.receipt.archiveSha256) throw new Error('prepared archive digest mismatch')
  assertPreparedEvidence(saved.receipt, readFileSync(join(outputDir, 'release-evidence.json')))
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${saved.receipt.repository}/actions/runs/${saved.receipt.runId}/attempts/${saved.receipt.runAttempt}`], { encoding: 'utf8', env: environment })) as PreparationRun
  const artifact = JSON.parse(execFileSync('gh', ['api', `repos/${saved.receipt.repository}/actions/artifacts/${saved.receipt.artifactId}`], { encoding: 'utf8', env: environment })) as PreparationArtifact
  assertPreparationMetadata(saved.receipt, run, artifact)
}

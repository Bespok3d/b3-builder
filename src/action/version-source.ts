// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { replaceManifestVersion, replaceRuntimeVersion, liveVersion } from './version-only.js'

export interface VersionField { path: string; candidateVersion: string; kind: 'manifest' | 'daemon-runtime' }

export function verifyVersionOnlyCommit(repository: string, candidateCommit: string, liveCommit: string, fields: VersionField[]): void {
  if (!fields.length || new Set(fields.map((field) => field.path)).size !== fields.length) throw new Error('version fields must be explicit and unique')
  const changed = git(repository, ['diff', '--name-only', '-z', candidateCommit, liveCommit]).toString('utf8').split('\0').filter(Boolean).sort()
  if (JSON.stringify(changed) !== JSON.stringify(fields.map((field) => field.path).sort())) throw new Error('source change is not exactly the enumerated version fields')
  fields.forEach((field) => verifyField(repository, candidateCommit, liveCommit, field))
}

function verifyField(repository: string, candidateCommit: string, liveCommit: string, field: VersionField): void {
  const candidate = git(repository, ['show', `${candidateCommit}:${field.path}`]).toString('utf8')
  const live = git(repository, ['show', `${liveCommit}:${field.path}`])
  const targetVersion = liveVersion(field.candidateVersion)
  const expected = field.kind === 'manifest' ? replaceManifestVersion(candidate, field.candidateVersion, targetVersion) : replaceRuntimeVersion(candidate, field.candidateVersion, targetVersion)
  if (!Buffer.from(expected).equals(live)) throw new Error(`non-version source change: ${field.path}`)
  const candidateMode = git(repository, ['ls-tree', candidateCommit, '--', field.path]).toString('utf8').split(' ')[0]
  const liveMode = git(repository, ['ls-tree', liveCommit, '--', field.path]).toString('utf8').split(' ')[0]
  if (candidateMode !== liveMode) throw new Error(`source mode changed: ${field.path}`)
}

function git(repository: string, args: string[]): Buffer { return execFileSync('git', ['-C', repository, ...args]) }

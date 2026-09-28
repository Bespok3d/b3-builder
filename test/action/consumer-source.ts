// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deepStrictEqual } from 'node:assert'

export function consumerSource(relativePath: string): Buffer {
  if (relativePath.endsWith('/.github/workflows/release.yml')) {
    const consumerWorkspace = process.env.B3D_CONSUMER_WORKSPACE ?? resolve(import.meta.dirname, '../../..')
    return readFileSync(resolve(consumerWorkspace, relativePath))
  }
  const snapshot = readFileSync(resolve(import.meta.dirname, '../fixtures/consumers', relativePath))
  const workspace = process.env.B3D_CONSUMER_WORKSPACE
  if (!workspace) return snapshot
  const actual = readFileSync(resolve(workspace, relativePath))
  deepStrictEqual(actual, snapshot, `consumer snapshot drift: ${relativePath}`)
  return actual
}

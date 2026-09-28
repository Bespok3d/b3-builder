// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { consumerSource } from './consumer-source.js'

afterEach(() => vi.unstubAllEnvs())
it('runs with local snapshots and rejects missing or changed actual consumer source', () => {
  vi.stubEnv('B3D_CONSUMER_WORKSPACE', '')
  const path = 'daemon/scripts/stage-package.sh'
  const snapshot = consumerSource(path)
  const workspace = mkdtempSync(join(tmpdir(), 'consumer-drift-'))
  vi.stubEnv('B3D_CONSUMER_WORKSPACE', workspace)
  expect(() => consumerSource(path)).toThrow()
  mkdirSync(dirname(join(workspace, path)), { recursive: true })
  writeFileSync(join(workspace, path), snapshot)
  expect(consumerSource(path)).toEqual(snapshot)
  writeFileSync(join(workspace, path), Buffer.concat([snapshot, Buffer.from('\n# drift\n')]))
  expect(() => consumerSource(path)).toThrow('consumer snapshot drift')
})

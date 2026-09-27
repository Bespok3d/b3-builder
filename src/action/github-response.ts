// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function githubBytes(args: string[]): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'release-download-'))
  const path = join(directory, 'response')
  const descriptor = openSync(path, 'w')
  try {
    execFileSync('gh', args, { stdio: ['ignore', descriptor, 'pipe'] })
    return readFileSync(path)
  } finally {
    closeSync(descriptor)
    rmSync(directory, { recursive: true, force: true })
  }
}

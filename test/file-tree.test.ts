// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFilesArray, normalizeMode } from '../src/core/build/file-tree.js'

function tempFile(mode: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'b3-mode-'))
  const path = join(dir, 'sample')
  writeFileSync(path, 'x')
  chmodSync(path, mode)
  return path
}

describe('normalizeMode', () => {
  it('normalizes a non-executable file to 644', () => {
    expect(normalizeMode(tempFile(0o644))).toBe('644')
  })

  it('normalizes an executable file to 755', () => {
    expect(normalizeMode(tempFile(0o755))).toBe('755')
  })
})

describe('buildFilesArray', () => {
  it('excludes __pycache__, .pyc, and .DS_Store from the checksummed manifest payload', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-payload-'))
    const filesDir = join(pluginDir, 'files')
    mkdirSync(join(filesDir, '__pycache__'), { recursive: true })
    writeFileSync(join(filesDir, 'plugin.py'), 'print(1)')
    writeFileSync(join(filesDir, '.DS_Store'), '')
    writeFileSync(join(filesDir, '__pycache__', 'plugin.cpython-311.pyc'), 'junk')

    const entries = buildFilesArray(pluginDir)
    expect(entries.map((entry) => entry.path)).toEqual(['files/plugin.py'])
  })
})

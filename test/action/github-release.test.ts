// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { githubReleaseHost } from '../../src/action/github-release.js'
import { readLiveBaseline } from '../../src/action/published-baseline.js'

function fakeGh(program: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'gh-fixture-'))
  const binary = join(directory, 'gh')
  writeFileSync(binary, `#!/usr/bin/env node\n${program}\n`)
  chmodSync(binary, 0o755)
  return directory
}

it('downloads a 2 MiB asset through the gh process without the default stdout buffer limit', () => {
  const previous = process.env.PATH
  process.env.PATH = `${fakeGh('process.stdout.write(Buffer.alloc(2 * 1024 * 1024, 65))')}:${previous}`
  try {
    expect(githubReleaseHost('test/repo').download({ name: 'package.b3', url: 'https://fixture.invalid/asset' })).toEqual(Buffer.alloc(2 * 1024 * 1024, 65))
  } finally { process.env.PATH = previous }
})

it('reuses the approved empty baseline on a first Live publication retry', async () => {
  const release = { tag_name: 'selected-v1', body: 'verified', draft: false, prerelease: false, assets: [] }
  const program = `const release = ${JSON.stringify(release)}; process.stdout.write(JSON.stringify(process.argv.includes('--slurp') ? [[release]] : release))`
  const previous = process.env.PATH
  process.env.PATH = `${fakeGh(program)}:${previous}`
  try {
    await expect(readLiveBaseline('test/repo', '', true, { 'selected-v1': 'verified' })).resolves.toMatchObject({ digest: 'empty' })
    await expect(readLiveBaseline('test/repo', '', false, { 'selected-v1': 'verified' })).rejects.toThrow('prior Live baseline is missing')
    await expect(readLiveBaseline('test/repo', '', true, { 'selected-v1': 'different' })).rejects.toThrow('unexpected release')
  } finally { process.env.PATH = previous }
})

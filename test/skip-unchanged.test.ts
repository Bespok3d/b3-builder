// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../src/core/index.js'
import type { BuildArtifacts } from '../src/core/index.js'

// A repo of one obviously-fake plugin (feedback_no_real_values_in_fixtures), so the skip test owns its
// tree and can touch it.
function fakeRepo(): string {
  const repoDir = mkdtempSync(join(tmpdir(), 'b3-skip-repo-'))
  const pluginDir = join(repoDir, 'demo-plugin')
  mkdirSync(join(pluginDir, 'files'), { recursive: true })
  writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({ name: 'demo-plugin', title: 'Demo', version: '0.0.1' }))
  writeFileSync(join(pluginDir, 'files', 'config.cfg'), '[demo]\n')
  return repoDir
}

const IDENTITY = { atomRepo: 'Example/demo', listName: 'Example Demo', listPublisher: 'example' }

function build(sourceDir: string, outputDir: string): Promise<BuildArtifacts> {
  return runPipeline({ unit: 'repo', sourceDir, outputDir, identity: IDENTITY, skipUnchanged: true })
}

describe('skip-unchanged', () => {
  it('packs on first build, skips an unchanged second build, repacks a touched plugin', async () => {
    const repoDir = fakeRepo()
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-skip-out-'))

    const first = await build(repoDir, outputDir)
    expect(first.packages.map((packed) => packed.skipped)).toEqual([false])

    const second = await build(repoDir, outputDir)
    expect(second.packages.map((packed) => packed.skipped)).toEqual([true])

    appendFileSync(join(repoDir, 'demo-plugin', 'files', 'config.cfg'), '# changed\n')
    const third = await build(repoDir, outputDir)
    expect(third.packages.map((packed) => packed.skipped)).toEqual([false])
  })
})

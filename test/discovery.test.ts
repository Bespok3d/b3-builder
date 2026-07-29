// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
import { discoverRepoSources, sourcesFor } from '../src/core/build/discovery.js'

// The caller-supplied exclude list (a dev-only variant dir that holds a manifest.json but must never
// publish, e.g. fluidd-bleeding-edge) is honored by discovery, so no step packs, atoms, or sub-lists it.
// The tool stays ignorant of WHY the dir is excluded: it is a passed-in curation parameter (ADR-0041),
// the same shape as publisher identity, never a baked variant concept.

function writePlugin(repoDir: string, dirName: string, name: string): void {
  const pluginDir = join(repoDir, dirName)
  mkdirSync(join(pluginDir, 'files'), { recursive: true })
  writeFileSync(join(pluginDir, 'files', 'placeholder.cfg'), `# ${name}\n`)
  const manifest = { name, version: '1.0.0', title: name, category: 'test', files: [] }
  writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function repoWithVariant(): string {
  const repoDir = mkdtempSync(join(tmpdir(), 'b3-exclude-'))
  writePlugin(repoDir, 'primary', 'primary')
  writePlugin(repoDir, 'primary-bleeding-edge', 'primary-bleeding-edge')
  writePlugin(repoDir, 'companion', 'companion')
  return repoDir
}

function sourceNames(repoDir: string, exclude: string[]): string[] {
  return discoverRepoSources(repoDir, exclude).map((source) => source.name).sort()
}

describe('discovery honors caller-supplied exclude-dirs', () => {
  it('discoverRepoSources skips an excluded dir, keeps the rest', () => {
    const repoDir = repoWithVariant()
    expect(sourceNames(repoDir, [])).toEqual(['companion', 'primary', 'primary-bleeding-edge'])
    expect(sourceNames(repoDir, ['primary-bleeding-edge'])).toEqual(['companion', 'primary'])
  })

  it('sourcesFor applies a repo request exclude; a plugin request has nothing to exclude', () => {
    const repoDir = repoWithVariant()
    const repoSources = sourcesFor({
      unit: 'repo',
      sourceDir: repoDir,
      outputDir: repoDir,
      identity: { atomRepo: 'Test/repo', listName: 'Test', listPublisher: 'Test' },
      exclude: ['primary-bleeding-edge'],
    })
    expect(repoSources.map((source) => source.name).sort()).toEqual(['companion', 'primary'])
    const pluginSources = sourcesFor({
      unit: 'plugin',
      sourceDir: join(repoDir, 'primary'),
      outputDir: repoDir,
      identity: { atomRepo: 'Test/repo' },
    })
    expect(pluginSources.map((source) => source.name)).toEqual(['primary'])
  })

  it('a full repo build never packs, atoms, or sub-lists an excluded dir', async () => {
    const repoDir = repoWithVariant()
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-exclude-out-'))
    const artifacts = await runPipeline({
      unit: 'repo',
      sourceDir: repoDir,
      outputDir,
      identity: { atomRepo: 'Test/repo', listName: 'Test', listPublisher: 'Test' },
      exclude: ['primary-bleeding-edge'],
    })
    expect(artifacts.packages.map((packed) => packed.filename).sort()).toEqual(['companion-1.0.0.b3', 'primary-1.0.0.b3'])
    expect(artifacts.atoms.map((atom) => (atom as JsonObject).name).sort()).toEqual(['companion', 'primary'])
    const listedNames = ((artifacts.subList as JsonObject).plugins as JsonObject[]).map((plugin) => plugin.name).sort()
    expect(listedNames).toEqual(['companion', 'primary'])
  }, 60_000)
})

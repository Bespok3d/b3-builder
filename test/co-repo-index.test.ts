// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../src/core/types.js'
import { assembleSubList } from '../src/core/build/co-repo-index.js'
import { runPipeline } from '../src/core/index.js'
import { stubPluginDir } from './stub-plugin.js'

function pluginAtom(name: string): JsonObject {
  return { name, version: '0.1.0', provides: [], require: [], updated_at: '2026-07-23' }
}

describe('assembleSubList author', () => {
  it('emits author, after publisher, when a list author is supplied', () => {
    const list = assembleSubList([pluginAtom('fluidd')], 'Bespok3d Official', 'FINGERPRINT', 'bespoked')
    expect(list.author).toBe('bespoked')
    expect(Object.keys(list)).toEqual(['schema_version', 'name', 'publisher', 'author', 'updated', 'assembled_at', 'plugins', 'lists'])
  })

  it('omits author entirely when no list author is supplied (unchanged shape)', () => {
    const list = assembleSubList([pluginAtom('fluidd')], 'Bespok3d Official', 'FINGERPRINT')
    expect('author' in list).toBe(false)
  })
})

// A published list rebuilt today over untouched plugins still reads months old in `updated`, which is
// derived from the entries, so nothing in the file told a reader when the run that produced it happened
// and a stale file served by a dead workflow looked exactly like a fresh one. This reads the stamp back
// out of the index.json a real assembly WROTE, never off the object the assembler returned: the value has
// to survive being serialized to the file a reader fetches.
describe('an assembled list carries the date of the assembly that produced it', () => {
  it('writes assembled_at into index.json as the UTC instant of the run', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'b3-assembly-stamp-repo-'))
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-assembly-stamp-out-'))
    stubPluginDir({ name: 'demo', version: '0.1.0', updated_at: '2026-01-02' }, repoDir)
    const startedAt = Date.now()

    await runPipeline({
      unit: 'repo',
      sourceDir: repoDir,
      outputDir,
      identity: { atomRepo: 'demo/demo-repo', listName: 'Demo List', listPublisher: 'PLACEHOLDER' },
    })
    const published = JSON.parse(readFileSync(join(outputDir, 'index.json'), 'utf8')) as JsonObject
    const stamped = String(published.assembled_at)

    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(Date.parse(stamped)).toBeGreaterThanOrEqual(startedAt - 1_000)
    expect(Date.parse(stamped)).toBeLessThanOrEqual(Date.now() + 1_000)
    expect(published.updated).toBe('2026-01-02')
  }, 30_000)
})

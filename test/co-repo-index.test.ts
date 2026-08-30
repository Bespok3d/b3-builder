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

const U1_BASE_LIST = { listName: 'U1 Base Layer', listPublisher: 'FINGERPRINT' }

function pluginAtom(name: string): JsonObject {
  return { name, version: '0.1.0', provides: [], require: [], updated_at: '2026-07-23' }
}

describe('assembleSubList author', () => {
  it('emits author, after publisher, when a list author is supplied', () => {
    const list = assembleSubList([pluginAtom('fluidd')], { listName: 'Bespok3d Official', listPublisher: 'FINGERPRINT', listAuthor: 'bespoked' })
    expect(list.author).toBe('bespoked')
    expect(Object.keys(list)).toEqual(['schema_version', 'name', 'publisher', 'author', 'updated', 'assembled_at', 'plugins', 'lists'])
  })

  it('omits author entirely when no list author is supplied (unchanged shape)', () => {
    const list = assembleSubList([pluginAtom('fluidd')], { listName: 'Bespok3d Official', listPublisher: 'FINGERPRINT' })
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

// The published u1-base index named `migrate-patch` in every base plugin's `deps`. `migrate-patch` is
// a service the DAEMON serves, so no publisher will ever publish a package with that id: the app went
// looking for one, refused the base plugin, and then refused rfid-ntag for depending on a plugin that
// had not installed. A requirement the daemon answers is a floor on the daemon build, never a package.
describe('a requirement the daemon serves never becomes a store dependency', () => {
  function basePluginAtom(name: string): JsonObject {
    return { name, version: '0.1.0', provides: [{ service: name }], require: [{ service: 'migrate-patch' }], updated_at: '2026-08-30' }
  }

  it('leaves deps empty when the only requirement is a daemon-served service', () => {
    const list = assembleSubList([basePluginAtom('u1-base-toolhead')], U1_BASE_LIST)
    const [baseEntry] = list.plugins as JsonObject[]
    expect(baseEntry?.deps).toEqual([])
  })

  it('keeps the plugin-provided requirements alongside a daemon-served one', () => {
    const consumer: JsonObject = {
      name: 'rfid-ntag',
      version: '0.1.14',
      provides: [],
      require: [{ service: 'migrate-patch' }, { service: 'u1-base-toolhead' }],
      updated_at: '2026-08-30',
    }
    const list = assembleSubList([basePluginAtom('u1-base-toolhead'), consumer], U1_BASE_LIST)
    const entries = list.plugins as JsonObject[]
    expect(entries.find((entry) => entry.name === 'rfid-ntag')?.deps).toEqual(['u1-base-toolhead'])
  })
})

// The live break: material-tags published `deps: ["rfid-service"]` and u1-camera-configs published
// `deps: ["camera-service"]`, because the plugin providing each sits in a DIFFERENT repo. Nothing can
// install a package by a service name, so both lists were dead for every user until they were fixed by
// hand. The provider a repo does not build is passed in, and a service still unaccounted for stops the
// build rather than shipping a name no registry can serve.
describe('a requirement met by a plugin in another repo', () => {
  const consumer: JsonObject = {
    name: 'rfid-anycubic',
    version: '0.1.0',
    provides: [],
    require: [{ service: 'rfid-service' }],
    updated_at: '2026-08-30',
  }

  it('resolves to the providing plugin id when that repo list is passed in', () => {
    const list = assembleSubList([consumer], U1_BASE_LIST, [{ name: 'rfid-ntag', provides: ['rfid-service'] }])
    const [entry] = list.plugins as JsonObject[]
    expect(entry?.deps).toEqual(['rfid-ntag'])
  })

  it('refuses to publish the list when no source accounts for the service', () => {
    expect(() => assembleSubList([consumer], U1_BASE_LIST)).toThrow(/rfid-anycubic.*rfid-service/s)
  })
})

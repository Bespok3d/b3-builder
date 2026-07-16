import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packPlugin } from '../src/core/build/archive.js'
import type { JsonObject } from '../src/core/index.js'
import { describeArchive } from './harness.js'

// A minimal plugin dir with one staged payload file, so packPlugin has a real files/ tree to checksum.
function stubPluginDir(manifest: JsonObject): string {
  const pluginDir = mkdtempSync(join(tmpdir(), 'b3-archive-'))
  writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync(join(pluginDir, 'files/bin'), { recursive: true })
  writeFileSync(join(pluginDir, 'files/bin/demo-aarch64'), 'staged payload\n')
  return pluginDir
}

describe('packPlugin drops build-only manifest fields', () => {
  it('strips the bake field from the packed .b3 manifest while keeping the rest', () => {
    const manifest: JsonObject = {
      name: 'demo',
      version: '0.1.0',
      bake: [{ class: 'download', fetch: [], include: [] }],
      install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
    }
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))

    const packed = packPlugin(manifest, stubPluginDir(manifest), outputDir)
    const shipped = describeArchive(packed.path).manifest

    expect(shipped.bake).toBeUndefined()
    expect(shipped.install).toEqual(manifest.install)
    expect(shipped.name).toBe('demo')
    expect(Array.isArray(shipped.files)).toBe(true)
  })
})

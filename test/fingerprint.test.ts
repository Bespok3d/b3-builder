import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pluginFingerprint } from '../src/core/build/fingerprint.js'

// Obviously-fake plugin (feedback_no_real_values_in_fixtures): no real plugin, LAN, or identity.
function fakePlugin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'b3-fp-'))
  mkdirSync(join(dir, 'files'), { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: 'demo-plugin', version: '0.0.1' }))
  writeFileSync(join(dir, 'files', 'config.cfg'), '[demo]\n')
  return dir
}

describe('pluginFingerprint', () => {
  it('is stable for the same dir and builder version', () => {
    const dir = fakePlugin()
    expect(pluginFingerprint(dir, '1.0.0')).toBe(pluginFingerprint(dir, '1.0.0'))
  })

  it('changes when the builder version changes', () => {
    const dir = fakePlugin()
    expect(pluginFingerprint(dir, '1.0.0')).not.toBe(pluginFingerprint(dir, '2.0.0'))
  })

  it('changes when a payload file changes', () => {
    const dir = fakePlugin()
    const before = pluginFingerprint(dir, '1.0.0')
    writeFileSync(join(dir, 'files', 'config.cfg'), '[demo]\nchanged = 1\n')
    expect(pluginFingerprint(dir, '1.0.0')).not.toBe(before)
  })

  it('changes when the manifest changes without a version bump', () => {
    const dir = fakePlugin()
    const before = pluginFingerprint(dir, '1.0.0')
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: 'demo-plugin', version: '0.0.1', description: 'new' }))
    expect(pluginFingerprint(dir, '1.0.0')).not.toBe(before)
  })
})

import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../src/core/types.js'
import { buildCollectionAtom, providerByService, resolveDeps, sharedEntryFields } from '../src/core/build/entry.js'

function pluginManifest(extra: JsonObject): JsonObject {
  return { name: 'fluidd', title: 'Fluidd', version: '0.1.4', requires: {}, provides: [], conflicts: [], ...extra }
}

describe('providerByService', () => {
  it('assigns the first provider of a service and ignores a later duplicate', () => {
    const providers = providerByService([
      { name: 'tun-module', provides: ['tun'] },
      { name: 'tailscale', provides: ['tailscale'] },
      { name: 'zerotier', provides: ['tun'] },
    ])
    expect(providers).toEqual({ tun: 'tun-module', tailscale: 'tailscale' })
  })
})

describe('resolveDeps', () => {
  it('resolves a required service to its provider id', () => {
    const providers = { tun: 'tun-module' }
    expect(resolveDeps(['tun'], providers)).toEqual(['tun-module'])
  })

  it('falls back to the raw service name when nothing provides it', () => {
    expect(resolveDeps(['unmet-service'], {})).toEqual(['unmet-service'])
  })

  it('deduplicates a service required more than once', () => {
    const providers = { tun: 'tun-module' }
    expect(resolveDeps(['tun', 'tun'], providers)).toEqual(['tun-module'])
  })
})

describe('author and sw_version on atoms', () => {
  it('carries author and sw_version onto a plugin entry when the manifest declares them', () => {
    const entry = sharedEntryFields(pluginManifest({ author: 'bespoked', sw_version: '1.37.2' }))
    expect(entry.author).toBe('bespoked')
    expect(entry.sw_version).toBe('1.37.2')
  })

  it('omits both keys when the manifest declares neither (unchanged for legacy plugins)', () => {
    const entry = sharedEntryFields(pluginManifest({}))
    expect('author' in entry).toBe(false)
    expect('sw_version' in entry).toBe(false)
  })

  it('carries author onto a collection but never sw_version (a collection wraps no external software)', () => {
    const manifest = { name: 'u1-extras', title: 'U1 Extras', version: '0.2.0', kind: 'collection', members: [], author: 'bespoked', sw_version: '9.9.9' }
    const atom = buildCollectionAtom(manifest, 'u1-extras/doc.md')
    expect(atom.author).toBe('bespoked')
    expect('sw_version' in atom).toBe(false)
  })
})

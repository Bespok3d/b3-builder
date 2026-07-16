import { describe, expect, it } from 'vitest'
import { providerByService, resolveDeps } from '../src/core/build/entry.js'

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

import { describe, expect, it } from 'vitest'
import { injectReleaseUrls } from '../../src/action/inject-release-urls.js'

// The Action's release step collects a { filename: assetUrl } map while uploading each .b3 to its
// GitHub release; the helper swaps the built sub-list's placeholder download_url (the bare filename) for
// the real URL, and refuses to publish an entry whose .b3 was never released.
describe('injectReleaseUrls', () => {
  const builtSubList = {
    schema_version: 1,
    name: 'Bespok3d Networking',
    publisher: 'PLACEHOLDER',
    plugins: [
      { name: 'tailscale', version: '0.1.1', download_url: 'tailscale-0.1.1.b3', category: 'networking' },
      { name: 'zerotier', version: '0.1.1', download_url: 'zerotier-0.1.1.b3', category: 'networking' },
    ],
    lists: [],
  }

  it('replaces each placeholder filename with its release asset URL', () => {
    const finalized = injectReleaseUrls(builtSubList, {
      'tailscale-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/111',
      'zerotier-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/222',
    })
    expect(finalized.plugins.map((plugin) => plugin.download_url)).toEqual([
      'https://api.github.com/repos/Bespok3d/networking/releases/assets/111',
      'https://api.github.com/repos/Bespok3d/networking/releases/assets/222',
    ])
  })

  it('leaves every other field and the list metadata untouched', () => {
    const finalized = injectReleaseUrls(builtSubList, {
      'tailscale-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/111',
      'zerotier-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/222',
    })
    expect(finalized.name).toBe('Bespok3d Networking')
    expect(finalized.publisher).toBe('PLACEHOLDER')
    expect(finalized.lists).toEqual([])
    expect(finalized.plugins[0]).toMatchObject({ name: 'tailscale', version: '0.1.1', category: 'networking' })
  })

  it('refuses to finalize a plugin whose .b3 was never released', () => {
    expect(() =>
      injectReleaseUrls(builtSubList, {
        'tailscale-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/111',
      }),
    ).toThrow(/zerotier-0.1.1.b3/)
  })
})

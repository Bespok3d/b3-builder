import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { injectReleaseUrls, publishSignedSubList } from '../../src/action/inject-release-urls.js'
import { verifyDetached } from '../../src/core/build/sign-bytes.js'

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

  // The list the build step signed is NOT the list a reader fetches: this step rewrites every
  // download_url afterwards. Signing upstream of the rewrite shipped a signature over bytes nobody is
  // served, which the app reads as tampering and refuses, so the signature is placed here, last.
  describe('the published list is signed over the bytes it publishes', () => {
    function stagedPublishPaths(): { builtIndexPath: string; assetUrlMapPath: string; publishedIndexPath: string } {
      const stagingDir = mkdtempSync(join(tmpdir(), 'b3-publish-sub-list-'))
      const builtIndexPath = join(stagingDir, 'built-index.json')
      const assetUrlMapPath = join(stagingDir, 'asset-urls.json')
      writeFileSync(builtIndexPath, JSON.stringify(builtSubList, null, 2))
      writeFileSync(
        assetUrlMapPath,
        JSON.stringify({
          'tailscale-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/111',
          'zerotier-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/222',
        }),
      )

      return { builtIndexPath, assetUrlMapPath, publishedIndexPath: join(stagingDir, 'index.json') }
    }

    it('writes a signature that verifies over the finalized index.json as served', async () => {
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'ecc',
        userIDs: [{ name: 'throwaway test key' }],
        format: 'armored',
      })
      const paths = stagedPublishPaths()

      const published = await publishSignedSubList(
        paths.builtIndexPath,
        paths.assetUrlMapPath,
        paths.publishedIndexPath,
        privateKey,
      )

      expect(published.signed).toBe(true)
      const publishedBytes = readFileSync(paths.publishedIndexPath)
      expect(publishedBytes.toString('utf8')).toContain('releases/assets/111')
      const armoredSignature = readFileSync(`${paths.publishedIndexPath}.sig`, 'utf8')
      expect(await verifyDetached(publishedBytes, armoredSignature, publicKey)).toBe(true)
    })

    it('publishes the list unsigned when the release run holds no key', async () => {
      const paths = stagedPublishPaths()

      const published = await publishSignedSubList(
        paths.builtIndexPath,
        paths.assetUrlMapPath,
        paths.publishedIndexPath,
        undefined,
      )

      expect(published.signed).toBe(false)
      expect(existsSync(`${paths.publishedIndexPath}.sig`)).toBe(false)
    })
  })
})

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as openpgp from 'openpgp'
import { beforeAll, describe, expect, it } from 'vitest'
import { provePublishedList } from '../../src/action/prove-published-list.js'
import { publishSignedSubList } from '../../src/action/inject-release-urls.js'
import { signDetached, signingKeyFingerprint } from '../../src/core/build/sign-bytes.js'

// The producer's own proof that the list it is about to publish is the list a reader can check. Both
// failures it refuses are failures that actually shipped, on green runs: ten sub-lists published with no
// signature at all, and then signed over the bytes before CI rewrote their download_urls, which a reader
// reads as tampering. Nothing was red either time, and both were found by hand.
describe('provePublishedList', () => {
  const signingKey = { armoredPrivate: '', fingerprint: '' }

  beforeAll(async () => {
    const generated = await openpgp.generateKey({
      type: 'ecc',
      userIDs: [{ name: 'throwaway test key' }],
      format: 'armored',
    })
    signingKey.armoredPrivate = generated.privateKey
    signingKey.fingerprint = await signingKeyFingerprint(generated.privateKey)
  })

  function stagedPublishPaths(publisher: string): {
    builtIndexPath: string
    assetUrlMapPath: string
    publishedIndexPath: string
  } {
    const stagingDir = mkdtempSync(join(tmpdir(), 'b3-prove-published-list-'))
    const builtIndexPath = join(stagingDir, 'built-index.json')
    const assetUrlMapPath = join(stagingDir, 'asset-urls.json')
    writeFileSync(
      builtIndexPath,
      JSON.stringify(
        {
          schema_version: 1,
          name: 'Bespok3d Networking',
          publisher,
          plugins: [{ name: 'tailscale', version: '0.1.1', download_url: 'tailscale-0.1.1.b3' }],
          lists: [],
        },
        null,
        2,
      ),
    )
    writeFileSync(
      assetUrlMapPath,
      JSON.stringify({ 'tailscale-0.1.1.b3': 'https://api.github.com/repos/Bespok3d/networking/releases/assets/111' }),
    )

    return { builtIndexPath, assetUrlMapPath, publishedIndexPath: join(stagingDir, 'index.json') }
  }

  it('publishes a list whose named publisher is the key that signed the served bytes', async () => {
    const paths = stagedPublishPaths(signingKey.fingerprint)

    const published = await publishSignedSubList(
      paths.builtIndexPath,
      paths.assetUrlMapPath,
      paths.publishedIndexPath,
      signingKey.armoredPrivate,
    )

    expect(published.signed).toBe(true)
  })

  it('refuses to publish a list that names a publisher when the run holds no signing key', async () => {
    const paths = stagedPublishPaths(signingKey.fingerprint)

    const publish = publishSignedSubList(paths.builtIndexPath, paths.assetUrlMapPath, paths.publishedIndexPath, undefined)

    await expect(publish).rejects.toThrow(/holds no signing key/)
  })

  it('still publishes unsigned when the list names no publisher, only a placeholder', async () => {
    const paths = stagedPublishPaths('PLACEHOLDER')

    const published = await publishSignedSubList(
      paths.builtIndexPath,
      paths.assetUrlMapPath,
      paths.publishedIndexPath,
      undefined,
    )

    expect(published.signed).toBe(false)
  })

  it('refuses a signature that covers bytes other than the ones being published', async () => {
    const stagingDir = mkdtempSync(join(tmpdir(), 'b3-prove-stale-signature-'))
    const publishedIndexPath = join(stagingDir, 'index.json')
    writeFileSync(publishedIndexPath, '{"download_url":"https://releases/assets/111"}\n')
    const staleSignature = await signDetached(
      Buffer.from('{"download_url":"tailscale-0.1.1.b3"}\n', 'utf8'),
      signingKey.armoredPrivate,
    )
    writeFileSync(`${publishedIndexPath}.sig`, staleSignature)

    const proof = provePublishedList(publishedIndexPath, signingKey.fingerprint, signingKey.armoredPrivate)

    await expect(proof).rejects.toThrow(/does not check out over the bytes being published/)
  })

  it('refuses a list signed by a key other than the publisher it names', async () => {
    const anotherPublisher = 'a'.repeat(40)
    const paths = stagedPublishPaths(anotherPublisher)

    const publish = publishSignedSubList(
      paths.builtIndexPath,
      paths.assetUrlMapPath,
      paths.publishedIndexPath,
      signingKey.armoredPrivate,
    )

    await expect(publish).rejects.toThrow(/but the run signed it with/)
  })
})

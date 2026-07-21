import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { resolveSigningKey } from '../src/cli/signing-key.js'

// --sign names a key; B3D_SIGNING_KEY carries one. These prove the naming channel actually reaches a
// usable armored key, and that a reference which resolves to nothing fails loudly instead of quietly
// producing an unsigned build (the failure mode that let a whole release ship with no signature).
async function throwawayPrivateKey(): Promise<string> {
  const { privateKey } = await openpgp.generateKey({
    type: 'ecc',
    userIDs: [{ name: 'throwaway test key' }],
    format: 'armored',
  })

  return privateKey
}

function keyFileHolding(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'b3-sign-ref-')), 'key.asc')
  writeFileSync(path, contents, 'utf8')

  return path
}

describe('resolveSigningKey', () => {
  it('reads the armored key out of the file --sign points at', async () => {
    const privateKey = await throwawayPrivateKey()

    expect(resolveSigningKey(keyFileHolding(privateKey), undefined)).toBe(privateKey)
  })

  it('falls back to the environment when nothing is named', async () => {
    const privateKey = await throwawayPrivateKey()

    expect(resolveSigningKey(undefined, privateKey)).toBe(privateKey)
  })

  it('prefers the named key over the ambient one', async () => {
    const namedKey = await throwawayPrivateKey()
    const ambientKey = await throwawayPrivateKey()

    expect(resolveSigningKey(keyFileHolding(namedKey), ambientKey)).toBe(namedKey)
  })

  it('leaves the build unsigned only when no key is offered at all', () => {
    expect(resolveSigningKey(undefined, undefined)).toBeUndefined()
  })

  it('refuses a file that holds no private key instead of building unsigned', () => {
    expect(() => resolveSigningKey(keyFileHolding('not a key at all'), undefined)).toThrow(/no armored PGP private key/)
  })

  it('refuses a key id no keyring can produce a secret key for', () => {
    expect(() => resolveSigningKey('B3D0000000000000NOSUCHKEY', undefined)).toThrow(/could not export a secret key/)
  })

  // An empty value handed to gpg is an empty match pattern, which exports every secret key the keyring
  // holds: the build would be signed by whichever one came out first, not by a key anybody chose.
  it('refuses an empty --sign instead of asking the keyring for every secret key it holds', () => {
    expect(() => resolveSigningKey('', undefined)).toThrow(/--sign needs a key file or a key id/)
  })

  it('reports a directory as a key that could not be found, not as a read error', () => {
    expect(() => resolveSigningKey(mkdtempSync(join(tmpdir(), 'b3-sign-dir-')), undefined)).toThrow(
      /could not export a secret key/,
    )
  })
})

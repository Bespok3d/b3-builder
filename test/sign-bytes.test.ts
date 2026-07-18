import { describe, expect, it } from 'vitest'
import * as openpgp from 'openpgp'
import { signDetached, verifyDetached } from '../src/core/build/sign-bytes.js'

// Obviously-fake keypair (feedback_no_real_values_in_fixtures): generated fresh per test, no real identity.
async function fakeKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: 'demo', email: 'demo@example.test' }],
    format: 'armored',
  })
  return { privateKey, publicKey }
}

describe('signDetached / verifyDetached', () => {
  it('a signature verifies against the exact bytes it signed', async () => {
    const { privateKey, publicKey } = await fakeKeypair()
    const bytes = new TextEncoder().encode('demo package payload\n')
    const signature = await signDetached(bytes, privateKey)
    expect(await verifyDetached(bytes, signature, publicKey)).toBe(true)
  })

  it('fails when a single byte of the signed content changes', async () => {
    const { privateKey, publicKey } = await fakeKeypair()
    const bytes = new TextEncoder().encode('demo package payload\n')
    const signature = await signDetached(bytes, privateKey)
    const tampered = Uint8Array.from(bytes)
    tampered[0] = tampered[0] ^ 0xff
    expect(await verifyDetached(tampered, signature, publicKey)).toBe(false)
  })

  it('fails against whitespace-reserialized bytes even though the logical content matches', async () => {
    const { privateKey, publicKey } = await fakeKeypair()
    const original = new TextEncoder().encode(JSON.stringify({ name: 'demo', version: '1.0.0' }))
    const signature = await signDetached(original, privateKey)
    const reserialized = new TextEncoder().encode(JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2))
    expect(await verifyDetached(reserialized, signature, publicKey)).toBe(false)
  })
})

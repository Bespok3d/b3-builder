import * as openpgp from 'openpgp'

// The one signing primitive (ADR-0041: identity is an input, never baked). Byte-generic: it signs
// whatever bytes it is given, so the pipeline step decides WHAT gets signed (a packed .b3 today) and
// this stays ignorant of packages, atoms, or indexes. The contract is over RAW SERVED BYTES: signing
// or verifying a re-serialized copy of the same logical content must fail, so a signature only ever
// vouches for the exact bytes a downstream fetch receives.

export async function signDetached(bytes: Uint8Array, armoredPrivateKey: string): Promise<string> {
  const message = await openpgp.createMessage({ binary: bytes })
  const signingKeys = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey })
  const signature = await openpgp.sign({ message, signingKeys, detached: true, format: 'armored' })
  return signature
}

export async function verifyDetached(
  bytes: Uint8Array,
  armoredSignature: string,
  armoredPublicKey: string,
): Promise<boolean> {
  const message = await openpgp.createMessage({ binary: bytes })
  const signature = await openpgp.readSignature({ armoredSignature })
  const verificationKeys = await openpgp.readKey({ armoredKey: armoredPublicKey })
  const { signatures } = await openpgp.verify({ message, signature, verificationKeys })
  const [firstSignature] = signatures
  if (firstSignature === undefined) return false
  return firstSignature.verified.then(() => true, () => false)
}

export async function publicKeyFingerprint(armoredPublicKey: string): Promise<string> {
  const key = await openpgp.readKey({ armoredKey: armoredPublicKey })
  return key.getFingerprint()
}

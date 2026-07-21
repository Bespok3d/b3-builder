import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { describeError } from '../core/index.js'

// Where the private key that signs a build comes from. Two channels, deliberately different things.
//
// B3D_SIGNING_KEY carries the armored KEY ITSELF and is how CI hands over a secret. A key can never
// travel as a flag value: an armored key starts with `-----BEGIN`, which node's parseArgs rejects as an
// option value, and anything in argv is readable by every other process on the machine through ps and
// /proc/<pid>/cmdline.
//
// --sign carries a REFERENCE to a key, which is neither secret nor dash-prefixed, so it is safe in argv
// and is the channel a person publishing from their own machine wants: the path to an armored private
// key file, or a key id / fingerprint to export out of the local GnuPG keyring. An explicit --sign wins
// over the ambient environment, because naming the key is a stronger statement than inheriting one.
const ARMORED_PRIVATE_HEADER = '-----BEGIN PGP PRIVATE KEY BLOCK-----'

export function resolveSigningKey(keyReference: string | undefined, ambientKey: string | undefined): string | undefined {
  if (keyReference === undefined) return ambientKey
  // An empty --sign is a mistake, never a request. Passed on to gpg it would be an empty match pattern,
  // which exports EVERY secret key in the keyring and signs the build with whichever one came out first.
  if (keyReference.trim() === '') throw new Error('--sign needs a key file or a key id')
  if (!isReadableFile(keyReference)) return exportFromKeyring(keyReference)
  const armoredKey = readFileSync(keyReference, 'utf8')
  if (!armoredKey.includes(ARMORED_PRIVATE_HEADER)) {
    throw new Error(`--sign ${keyReference}: that file holds no armored PGP private key`)
  }

  return armoredKey
}

function isReadableFile(keyReference: string): boolean {
  try {
    return statSync(keyReference).isFile()
  } catch {
    return false
  }
}

// Not a file, so it is taken as a key id. gpg is asked for the secret key in batch mode, which means a
// passphrase-locked key only succeeds while the agent has it unlocked. An id the keyring does not hold
// leaves gpg exiting cleanly with nothing on stdout, so an empty export is a failure like any other:
// letting it through would hand the pipeline an empty key and pack an unsigned build in silence.
function exportFromKeyring(keyId: string): string {
  const exported = runGpgExport(keyId)
  if (!exported.includes(ARMORED_PRIVATE_HEADER)) {
    throw new Error(`--sign ${keyId}: not a readable file, and gpg could not export a secret key for it`)
  }
  // A partial id can match several keys, and gpg exports all of them. Signing would then use whichever
  // one happened to come first, so the build would be signed by a key the publisher did not choose.
  if (exported.split(ARMORED_PRIVATE_HEADER).length > 2) {
    throw new Error(`--sign ${keyId}: that id matches more than one secret key. Name the key by its full fingerprint.`)
  }

  return exported
}

function runGpgExport(keyId: string): string {
  try {
    return execFileSync('gpg', ['--batch', '--armor', '--export-secret-keys', keyId], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (failure) {
    throw new Error(
      `--sign ${keyId}: not a readable file, and gpg could not export a secret key for it (${gpgFailureDetail(failure)})`,
      { cause: failure },
    )
  }
}

// gpg says WHY on stderr ("No secret key", a locked keyring, a missing agent); the thrown Error's own
// message is only the exit status, which tells the publisher nothing about what to change.
function gpgFailureDetail(failure: unknown): string {
  const stderr = (failure as { stderr?: unknown }).stderr
  const reported = typeof stderr === 'string' ? stderr.trim() : ''

  return reported === '' ? describeError(failure) : reported
}

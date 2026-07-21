import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import AdmZip from 'adm-zip'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { SIGNING_KEY_VAR, requestFromArgs } from '../src/cli/build-request.js'
import { signingKeyFingerprint, verifyDetached } from '../src/core/build/sign-bytes.js'
import { runPipeline } from '../src/core/index.js'
import type { BuildArtifacts, JsonObject } from '../src/core/index.js'
import { stubPluginDir } from './stub-plugin.js'

// The signing SEAM, not the signing primitive: archive.test.ts proves signManifestInPlace signs, and
// still passed while no real invocation could ever reach it (the key used to arrive as --signing-key,
// which node's parseArgs rejects for any value starting with a dash, and every armored key does). These
// tests exercise the path a real build takes: invocation plus environment into a request, request
// through the whole pipeline, signature read back out of the produced .b3.
const ARMORED_PRIVATE_KEY_HEADER = '-----BEGIN PGP PRIVATE KEY BLOCK-----'

const DEMO_MANIFEST: JsonObject = {
  name: 'demo',
  version: '0.1.0',
  publisher: 'PLACEHOLDER',
  install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
}

function buildArgsFor(sourceDir: string, outputDir: string): string[] {
  return ['--unit', 'plugin', '--source', sourceDir, '--out', outputDir, '--atom-repo', 'demo/demo-plugin']
}

async function throwawayKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  return openpgp.generateKey({ type: 'ecc', userIDs: [{ name: 'throwaway test key' }], format: 'armored' })
}

async function builtArtifacts(armoredPrivateKey: string | undefined): Promise<BuildArtifacts> {
  const outputDir = mkdtempSync(join(tmpdir(), 'b3-signing-path-out-'))
  const environment = armoredPrivateKey === undefined ? {} : { [SIGNING_KEY_VAR]: armoredPrivateKey }
  const request = requestFromArgs(buildArgsFor(stubPluginDir(DEMO_MANIFEST), outputDir), environment)
  return runPipeline(request)
}

async function signedPackagePath(armoredPrivateKey: string | undefined): Promise<string> {
  const packed = (await builtArtifacts(armoredPrivateKey)).packages[0]
  if (packed === undefined) throw new Error('the pipeline produced no package to inspect')
  return packed.path
}

function packedManifest(packagePath: string): JsonObject {
  const manifestBytes = new AdmZip(packagePath).getEntry('manifest.json')?.getData()
  if (manifestBytes === undefined) throw new Error('the build produced a .b3 with no manifest.json')
  return JSON.parse(manifestBytes.toString('utf8')) as JsonObject
}

describe('the signing key reaches a build as key material in the environment or as a name in argv', () => {
  it('carries an armored private key from a key file named by --sign into the build request', async () => {
    const { privateKey } = await throwawayKeyPair()
    const keyFile = join(mkdtempSync(join(tmpdir(), 'b3-signing-path-key-')), 'key.asc')
    writeFileSync(keyFile, privateKey, 'utf8')

    const request = requestFromArgs([...buildArgsFor(stubPluginDir(DEMO_MANIFEST), tmpdir()), '--sign', keyFile], {})

    expect(request.signingKey).toBe(privateKey)
  })

  it('carries an armored private key from B3D_SIGNING_KEY into the build request', async () => {
    const { privateKey } = await throwawayKeyPair()

    const request = requestFromArgs(buildArgsFor(stubPluginDir(DEMO_MANIFEST), tmpdir()), {
      [SIGNING_KEY_VAR]: privateKey,
    })

    expect(request.signingKey).toBe(privateKey)
  })

  it('could never have carried one as a --signing-key flag value, which is why the env var exists', () => {
    expect(() =>
      parseArgs({
        args: ['--signing-key', ARMORED_PRIVATE_KEY_HEADER],
        options: { 'signing-key': { type: 'string' } },
      }),
    ).toThrow(/ambiguous/)
  })

  it('treats an empty B3D_SIGNING_KEY as no key, so an unset CI secret packs unsigned instead of failing', () => {
    const request = requestFromArgs(buildArgsFor(stubPluginDir(DEMO_MANIFEST), tmpdir()), { [SIGNING_KEY_VAR]: '' })

    expect(request.signingKey).toBeUndefined()
  })
})

// GnuPG exports a secret key still wrapped in its passphrase, and such a key cannot sign. Without this
// the build runs to completion and dies inside packing on openpgp's "Private key is not decrypted".
describe('a passphrase-protected key is refused at the first touch of the key', () => {
  it('names the locked key as the cause instead of failing later inside packing', async () => {
    const lockedKey = await openpgp.generateKey({
      type: 'ecc',
      userIDs: [{ name: 'throwaway locked test key' }],
      passphrase: 'throwaway passphrase',
      format: 'armored',
    })

    await expect(signingKeyFingerprint(lockedKey.privateKey)).rejects.toThrow(/passphrase-protected and cannot sign/)
  })
})

describe('a full pipeline run signs what it packs', () => {
  it('produces a .b3 whose manifest.json.sig verifies over the packed manifest bytes', async () => {
    const { privateKey, publicKey } = await throwawayKeyPair()

    const zip = new AdmZip(await signedPackagePath(privateKey))
    const manifestBytes = zip.getEntry('manifest.json')?.getData()
    const armoredSignature = zip.getEntry('manifest.json.sig')?.getData().toString('utf8')
    if (manifestBytes === undefined || armoredSignature === undefined) {
      throw new Error('a signed build produced a .b3 missing manifest.json or manifest.json.sig')
    }

    expect(await verifyDetached(manifestBytes, armoredSignature, publicKey)).toBe(true)
  })

  it('produces an unsigned .b3 when no key is in the environment', async () => {
    const zip = new AdmZip(await signedPackagePath(undefined))

    expect(zip.getEntry('manifest.json')).not.toBeNull()
    expect(zip.getEntry('manifest.json.sig')).toBeNull()
  })
})

// A source repo checks in publisher PLACEHOLDER because it cannot know which key will sign its release,
// so a signed build that shipped that value would hand every printer a package claiming an identity
// nobody holds while the signature beside it named the real one.
describe('a signed build publishes under the identity it signs with', () => {
  it('replaces the source placeholder in the packed manifest with the signing key fingerprint', async () => {
    const { privateKey } = await throwawayKeyPair()

    const manifest = packedManifest(await signedPackagePath(privateKey))

    expect(manifest.publisher).toBe(await signingKeyFingerprint(privateKey))
  })

  it('gives the catalog atom the same publisher as the package it points at', async () => {
    const { privateKey } = await throwawayKeyPair()

    const artifacts = await builtArtifacts(privateKey)

    expect(artifacts.atoms[0]?.publisher).toBe(await signingKeyFingerprint(privateKey))
  })

  it('leaves the declared publisher alone on an unsigned build, which claims no identity', async () => {
    const manifest = packedManifest(await signedPackagePath(undefined))

    expect(manifest.publisher).toBe('PLACEHOLDER')
  })
})

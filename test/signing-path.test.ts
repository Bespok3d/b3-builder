import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import AdmZip from 'adm-zip'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { SIGNING_KEY_VAR, requestFromArgs } from '../src/cli/build-request.js'
import { verifyDetached } from '../src/core/build/sign-bytes.js'
import { runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
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
  install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
}

function buildArgsFor(sourceDir: string, outputDir: string): string[] {
  return ['--unit', 'plugin', '--source', sourceDir, '--out', outputDir, '--atom-repo', 'demo/demo-plugin']
}

async function throwawayKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  return openpgp.generateKey({ type: 'ecc', userIDs: [{ name: 'throwaway test key' }], format: 'armored' })
}

async function signedPackagePath(armoredPrivateKey: string | undefined): Promise<string> {
  const outputDir = mkdtempSync(join(tmpdir(), 'b3-signing-path-out-'))
  const environment = armoredPrivateKey === undefined ? {} : { [SIGNING_KEY_VAR]: armoredPrivateKey }
  const request = requestFromArgs(buildArgsFor(stubPluginDir(DEMO_MANIFEST), outputDir), environment)
  const artifacts = await runPipeline(request)
  const packed = artifacts.packages[0]
  if (packed === undefined) throw new Error('the pipeline produced no package to inspect')
  return packed.path
}

describe('the signing key reaches a build through the environment, never argv', () => {
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

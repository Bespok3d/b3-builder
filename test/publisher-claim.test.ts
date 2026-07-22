import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { signingKeyFingerprint } from '../src/core/build/sign-bytes.js'
import { runPipeline } from '../src/core/index.js'
import type { JsonObject } from '../src/core/index.js'
import { stubPluginDir } from './stub-plugin.js'

// A manifest's publisher is a claim and the signature packed beside it is the proof. An unsigned build
// signs nothing, so a manifest that hand-declares a real fingerprint used to pack that name into the .b3
// with nothing behind it: the reader sees a package claiming an identity and no signature to check it
// against. These pin the refusal, and pin that the two states which are NOT a claim (the placeholder every
// source repo checks in, and a signed build) still build.
const A_FAKE_FINGERPRINT = '0123456789abcdef0123456789abcdef01234567'

function manifestDeclaring(publisher: string): JsonObject {
  return {
    name: 'demo',
    version: '0.1.0',
    publisher,
    install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
  }
}

function build(publisher: string, signingKey?: string): ReturnType<typeof runPipeline> {
  const sourceDir = stubPluginDir(manifestDeclaring(publisher))
  const outputDir = mkdtempSync(join(tmpdir(), 'b3-publisher-claim-out-'))
  return runPipeline({ unit: 'plugin', sourceDir, outputDir, identity: { atomRepo: 'demo/demo-plugin' }, signingKey })
}

function packedPublisher(packagePath: string): unknown {
  const manifestBytes = new AdmZip(packagePath).getEntry('manifest.json')?.getData()
  if (manifestBytes === undefined) throw new Error('the build produced a .b3 with no manifest.json')
  return (JSON.parse(manifestBytes.toString('utf8')) as JsonObject).publisher
}

describe('a package never ships a publisher name the build cannot prove', () => {
  it('refuses an unsigned build whose manifest declares a key fingerprint as its publisher', async () => {
    await expect(build(A_FAKE_FINGERPRINT)).rejects.toThrow(/no signing key/)
  })

  it('builds the placeholder a source repo checks in, which claims nothing', async () => {
    const artifacts = await build('PLACEHOLDER')

    expect(packedPublisher(artifacts.packages[0]?.path ?? '')).toBe('PLACEHOLDER')
  })

  it('builds a declared fingerprint when the run holds a key, stamping the identity that really signed', async () => {
    const { privateKey } = await openpgp.generateKey({ type: 'ecc', userIDs: [{ name: 'throwaway test key' }], format: 'armored' })

    const artifacts = await build(A_FAKE_FINGERPRINT, privateKey)

    expect(packedPublisher(artifacts.packages[0]?.path ?? '')).toBe(await signingKeyFingerprint(privateKey))
  })
})

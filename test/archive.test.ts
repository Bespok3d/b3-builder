// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { packPlugin, signManifestInPlace } from '../src/core/build/archive.js'
import { verifyDetached } from '../src/core/build/sign-bytes.js'
import type { JsonObject } from '../src/core/index.js'
import { describeArchive } from './harness.js'
import { stubPluginDir } from './stub-plugin.js'

// manifest.json holds files[], so it can never carry its own hash, and its detached signature does not
// exist until the manifest is final. Those two are the whole exemption list, and it is arithmetic, not
// policy. EVERY other member of a .b3 must be listed, doc/ included, or it rides along unsigned.
const MEMBERS_UNLISTED_BY_DESIGN = ['manifest.json', 'manifest.json.sig']

describe('packPlugin drops build-only manifest fields', () => {
  it('strips the bake field from the packed .b3 manifest while keeping the rest', () => {
    const manifest: JsonObject = {
      name: 'demo',
      version: '0.1.0',
      bake: [{ class: 'download', fetch: [], include: [] }],
      install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
    }
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))

    const packed = packPlugin(manifest, stubPluginDir(manifest), outputDir)
    const shipped = describeArchive(packed.path).manifest

    expect(shipped.bake).toBeUndefined()
    expect(shipped.install).toEqual(manifest.install)
    expect(shipped.name).toBe('demo')
    expect(Array.isArray(shipped.files)).toBe(true)
  })
})

describe('packPlugin lists every payload member it archives', () => {
  it('leaves nothing but manifest.json and manifest.json.sig out of files[], doc and junk included', async () => {
    const manifest: JsonObject = {
      name: 'demo',
      version: '0.1.0',
      install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
    }
    const pluginDir = stubPluginDir(manifest)
    mkdirSync(join(pluginDir, 'files/extras/__pycache__'), { recursive: true })
    writeFileSync(join(pluginDir, 'files/extras/__pycache__/helper.cpython-311.pyc'), 'cached bytecode\n')
    writeFileSync(join(pluginDir, 'files/extras/helper.pyc'), 'loose bytecode\n')
    writeFileSync(join(pluginDir, 'files/extras/.DS_Store'), 'finder junk\n')
    mkdirSync(join(pluginDir, 'doc'), { recursive: true })
    writeFileSync(join(pluginDir, 'doc/README.md'), 'how to use demo\n')
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))

    const packed = packPlugin(manifest, pluginDir, outputDir)
    const { privateKey } = await openpgp.generateKey({
      type: 'ecc',
      userIDs: [{ name: 'throwaway test key' }],
      format: 'armored',
    })
    await signManifestInPlace(packed.path, privateKey)

    const members = new AdmZip(packed.path).getEntries().filter((entry) => !entry.isDirectory)
    const memberNames = members.map((entry) => entry.entryName)
    const packedManifest = JSON.parse(
      members.find((entry) => entry.entryName === 'manifest.json')?.getData().toString('utf8') ?? '{}',
    ) as { files: { path: string }[] }
    const listed = new Set(packedManifest.files.map((entry) => entry.path))
    const unlisted = memberNames.filter((name) => !listed.has(name))

    expect(unlisted.sort()).toEqual(MEMBERS_UNLISTED_BY_DESIGN)
    expect(memberNames).toContain('files/bin/demo-aarch64')
    expect(listed.has('doc/README.md')).toBe(true)
  })
})

// Two plugin releases shipped with nothing under files/: a .b3 that installs nothing, which an owner can
// only discover by installing it. Every packing path (the pack step, a skip-unchanged rebuild, the app's
// bundle glue) goes through packPlugin, so the refusal lives there and no caller can forget it. Remove the
// refuseEmptyPayload call and the first case below packs happily, which is the old behaviour.
describe('packPlugin refuses a package with no payload', () => {
  it('fails, naming the package, when nothing but a manifest and a README is there to pack', () => {
    const manifest: JsonObject = { name: 'hollow-demo', version: '0.1.0' }
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-hollow-plugin-'))
    writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
    mkdirSync(join(pluginDir, 'doc'), { recursive: true })
    writeFileSync(join(pluginDir, 'doc/README.md'), 'prose reaches no printer\n')
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))

    expect(() => packPlugin(manifest, pluginDir, outputDir)).toThrow(/hollow-demo: the plugin dir holds no payload/)
  })

  it('packs a plugin whose whole payload is a Python dep declaration', () => {
    const manifest: JsonObject = { name: 'deps-only-demo', version: '0.1.0' }
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-deps-only-plugin-'))
    writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
    writeFileSync(join(pluginDir, 'requirements.txt'), 'spoolman-client==1.0.0\n')
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))

    const packed = packPlugin(manifest, pluginDir, outputDir)

    expect(new AdmZip(packed.path).getEntries().map((entry) => entry.entryName)).toContain('requirements.txt')
  })
})

describe('signManifestInPlace', () => {
  it('adds a manifest.json.sig that verifies against the packed manifest bytes, and breaks on tamper', async () => {
    const manifest: JsonObject = {
      name: 'demo',
      version: '0.1.0',
      install: { place: [{ class: 'system-bin', src: 'files/bin/demo-aarch64' }] },
    }
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-archive-out-'))
    const packed = packPlugin(manifest, stubPluginDir(manifest), outputDir)

    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'ecc',
      userIDs: [{ name: 'throwaway test key' }],
      format: 'armored',
    })
    await signManifestInPlace(packed.path, privateKey)

    const zip = new AdmZip(packed.path)
    const manifestBytes = zip.getEntry('manifest.json')?.getData()
    const armoredSignature = zip.getEntry('manifest.json.sig')?.getData().toString('utf8')
    if (manifestBytes === undefined || armoredSignature === undefined) throw new Error('signed .b3 missing an entry')

    expect(await verifyDetached(manifestBytes, armoredSignature, publicKey)).toBe(true)
    expect(await verifyDetached(Buffer.concat([manifestBytes, Buffer.from(' ')]), armoredSignature, publicKey)).toBe(
      false,
    )
  })
})

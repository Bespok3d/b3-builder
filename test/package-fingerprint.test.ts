// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import * as openpgp from 'openpgp'
import { describe, expect, it } from 'vitest'
import { pluginFingerprint } from '../src/core/build/fingerprint.js'
import { verifyDetached } from '../src/core/build/sign-bytes.js'
import { builderVersion, runPipeline } from '../src/core/index.js'
import type { BuildArtifacts, JsonObject } from '../src/core/index.js'
import { stubPluginDir } from './stub-plugin.js'

// A reader decides "update available" by comparing the installed fingerprint with the published one, so
// a rebuild at an unchanged version is still offered. These pin that every packed manifest, every atom
// and every sub-list plugin entry carries the ONE value pluginFingerprint gives for that source, that a
// signature covers it, and that writing it into the package does not move the fingerprint itself.
const PLUGIN_MANIFEST: JsonObject = { name: 'demo', title: 'Demo', version: '0.1.0' }
const COLLECTION_MANIFEST: JsonObject = { name: 'demo-set', title: 'Demo Set', version: '0.1.0', kind: 'collection', members: [] }
const LIST_IDENTITY = { atomRepo: 'Example/demo', listName: 'Example Demo', listPublisher: 'example' }
const SHA256_HEX = /^[0-9a-f]{64}$/

function packedManifestBytes(packagePath: string): Buffer {
  const manifestBytes = new AdmZip(packagePath).getEntry('manifest.json')?.getData()
  if (manifestBytes === undefined) throw new Error(`${packagePath} has no manifest.json`)
  return manifestBytes
}

function packedFingerprint(artifacts: BuildArtifacts): unknown {
  const packed = artifacts.packages[0]
  if (packed === undefined) throw new Error('the build produced no package')
  return (JSON.parse(packedManifestBytes(packed.path).toString('utf8')) as JsonObject).fingerprint
}

function demoRepo(): { repoDir: string; pluginDir: string } {
  const repoDir = mkdtempSync(join(tmpdir(), 'b3-fingerprint-repo-'))
  const pluginDir = stubPluginDir(PLUGIN_MANIFEST, repoDir)
  stubPluginDir(COLLECTION_MANIFEST, repoDir)
  return { repoDir, pluginDir }
}

function outputDir(): string {
  return mkdtempSync(join(tmpdir(), 'b3-fingerprint-out-'))
}

describe('a build publishes the package fingerprint', () => {
  it('writes it into the packed manifest and the atom, and packing it does not move it', async () => {
    const pluginDir = stubPluginDir(PLUGIN_MANIFEST)
    const expected = pluginFingerprint(pluginDir, builderVersion())

    const artifacts = await runPipeline({ unit: 'plugin', sourceDir: pluginDir, outputDir: outputDir(), identity: { atomRepo: 'Example/demo' } })

    expect(expected).toMatch(SHA256_HEX)
    expect(packedFingerprint(artifacts)).toBe(expected)
    expect(artifacts.packages[0]?.fingerprint).toBe(expected)
    expect(artifacts.atoms[0]?.fingerprint).toBe(expected)
    expect(pluginFingerprint(pluginDir, builderVersion())).toBe(expected)
  })

  it('gives each sub-list plugin entry the value its package carries, and a collection none', async () => {
    const { repoDir, pluginDir } = demoRepo()

    const artifacts = await runPipeline({ unit: 'repo', sourceDir: repoDir, outputDir: outputDir(), identity: LIST_IDENTITY })

    const subList = artifacts.subList as JsonObject
    const [pluginEntry] = subList.plugins as JsonObject[]
    const [collectionEntry] = subList.collections as JsonObject[]
    expect(pluginEntry?.fingerprint).toBe(pluginFingerprint(pluginDir, builderVersion()))
    expect(pluginEntry?.fingerprint).toBe(packedFingerprint(artifacts))
    expect(collectionEntry?.name).toBe('demo-set')
    expect(collectionEntry?.fingerprint).toBeUndefined()
  })

  it('keeps it on the atom when skip-unchanged reuses the package', async () => {
    const { repoDir, pluginDir } = demoRepo()
    const sharedOutputDir = outputDir()
    const request = { unit: 'repo' as const, sourceDir: repoDir, outputDir: sharedOutputDir, identity: LIST_IDENTITY, skipUnchanged: true }

    await runPipeline(request)
    const reused = await runPipeline(request)

    expect(reused.packages[0]?.skipped).toBe(true)
    expect(packedFingerprint(reused)).toBe(pluginFingerprint(pluginDir, builderVersion()))
    expect(reused.atoms.find((atom) => atom.name === 'demo')?.fingerprint).toBe(packedFingerprint(reused))
  })

  it('carries it inside the bytes the manifest signature covers', async () => {
    const { privateKey, publicKey } = await openpgp.generateKey({ type: 'ecc', userIDs: [{ name: 'throwaway test key' }], format: 'armored' })
    const pluginDir = stubPluginDir(PLUGIN_MANIFEST)

    const artifacts = await runPipeline({ unit: 'plugin', sourceDir: pluginDir, outputDir: outputDir(), identity: { atomRepo: 'Example/demo' }, signingKey: privateKey })

    const archive = new AdmZip(artifacts.packages[0]!.path)
    const manifestBytes = archive.getEntry('manifest.json')!.getData()
    const signature = archive.getEntry('manifest.json.sig')!.getData().toString('utf8')
    expect(await verifyDetached(manifestBytes, signature, publicKey)).toBe(true)
    expect(packedFingerprint(artifacts)).toBe(pluginFingerprint(pluginDir, builderVersion()))
  })
})

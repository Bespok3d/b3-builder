// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { docAssetName } from './release-doc-urls.js'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { BuildRequest, JsonObject, ReleaseKind } from '../core/types.js'
import { sourcesFor } from '../core/build/discovery.js'
import { selectedAtoms, assertReleaseVersion } from '../core/build/release-kind.js'
import { pluginFingerprint } from '../core/build/fingerprint.js'
import { publicHalfOfSigningKey, signDetached, verifyDetached } from '../core/build/sign-bytes.js'
import { sha256, verifyPackage } from './verify-package.js'

export interface ReleaseUnit {
  name: string; version: string; sourceDigest: string; atom: JsonObject; assets: Record<string, string>
}
export interface ReleaseEvidence {
  sourceCommit: string; builderCommit: string; registerCommit: string; kind: ReleaseKind; repository: string
  units: ReleaseUnit[]; baseline?: JsonObject; builtList?: JsonObject; baselineDigest?: string
}
export interface ReleaseIdentity {
  sourceCommit: string; builderCommit: string; registerCommit: string; requireSignature: boolean
}

export function assertToolingIdentity(identity: ReleaseIdentity): void {
  Object.entries(identity).filter(([name]) => name.endsWith('Commit')).forEach(([name, commit]) => {
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) throw new Error(`missing exact ${name} pin`)
  })
}

export async function prepareEvidence(request: BuildRequest, atoms: JsonObject[], identity: ReleaseIdentity, baseline?: JsonObject, baselineDigest?: string): Promise<ReleaseEvidence> {
  assertToolingIdentity(identity)
  const publicKey = request.signingKey ? await publicHalfOfSigningKey(request.signingKey) : undefined
  const selected = selectedAtoms(atoms, request.selectedIds)
  const units = await Promise.all(selected.map((atom) => prepareUnit(request, atom, identity, publicKey)))
  const evidence: ReleaseEvidence = { ...identity, kind: request.releaseKind ?? 'live', repository: request.identity.atomRepo, units, ...(baseline ? { baseline, baselineDigest, builtList: JSON.parse(readFileSync(join(request.outputDir, 'index.json'), 'utf8')) as JsonObject } : {}) }
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`)
  writeFileSync(join(request.outputDir, 'release-evidence.json'), bytes)
  if (request.signingKey) writeFileSync(join(request.outputDir, 'release-evidence.json.sig'), await signDetached(bytes, request.signingKey))
  return evidence
}

async function prepareUnit(request: BuildRequest, atom: JsonObject, identity: ReleaseIdentity, publicKey?: string): Promise<ReleaseUnit> {
  const source = sourcesFor(request).find((source) => source.manifest.name === atom.name)!
  const name = String(atom.name)
  const version = String(atom.version)
  const assets: Record<string, string> = {}
  assertReleaseVersion(version, request.releaseKind ?? 'live')
  if (atom.kind !== 'collection') {
    const filename = `${name}-${version}.b3`
    const manifest = await verifyPackage(join(request.outputDir, filename), publicKey, identity.requireSignature)
    if (manifest.name !== name || manifest.version !== version) throw new Error(`package identity mismatch: ${name}`)
    assets[filename] = sha256(readFileSync(join(request.outputDir, filename)))
  }
  const docs = [[source.manifest.changelog, 'CHANGELOG.md'], ['doc/README.md', 'README.md']]
  docs.forEach(([path, suffix]) => {
    if (typeof path !== 'string' || !path) return
    if (!existsSync(join(source.dir, path)) && suffix === 'README.md') return
    const filename = docAssetName(name, version, suffix as 'README.md' | 'CHANGELOG.md')
    copyFileSync(join(source.dir, path), join(request.outputDir, filename))
    assets[filename] = sha256(readFileSync(join(request.outputDir, filename)))
  })
  return { name, version, sourceDigest: pluginFingerprint(source.dir, identity.builderCommit), atom, assets }
}

export async function verifyEvidence(request: BuildRequest, identity: ReleaseIdentity): Promise<ReleaseEvidence> {
  assertToolingIdentity(identity)
  const bytes = readFileSync(join(request.outputDir, 'release-evidence.json'))
  const evidence = JSON.parse(bytes.toString('utf8')) as ReleaseEvidence
  const publicKey = request.signingKey ? await publicHalfOfSigningKey(request.signingKey) : undefined
  await verifyEvidenceSignature(request.outputDir, bytes, publicKey, identity.requireSignature)
  if (evidence.sourceCommit !== identity.sourceCommit || evidence.builderCommit !== identity.builderCommit || evidence.registerCommit !== identity.registerCommit || evidence.repository !== request.identity.atomRepo) throw new Error('release artifact/source/tooling binding mismatch')
  if (evidence.kind !== request.releaseKind && !(evidence.kind === 'draft' && request.releaseKind === 'prerelease')) throw new Error('release artifact kind mismatch')
  const selected = selectedAtoms(sourcesFor(request).map((source) => source.manifest), request.selectedIds).map((manifest) => manifest.name).sort()
  if (JSON.stringify(selected) !== JSON.stringify(evidence.units.map((unit) => unit.name).sort())) throw new Error('release selected unit set mismatch')
  await Promise.all(evidence.units.map((unit) => verifyUnit(request, identity, unit, publicKey)))
  return evidence
}

async function verifyEvidenceSignature(outputDir: string, bytes: Buffer, publicKey: string | undefined, required: boolean): Promise<void> {
  const signaturePath = join(outputDir, 'release-evidence.json.sig')
  if (!existsSync(signaturePath)) {
    if (required) throw new Error('required release evidence signature missing')
    return
  }
  if (!publicKey || !await verifyDetached(bytes, readFileSync(signaturePath, 'utf8'), publicKey)) throw new Error('release evidence signature invalid')
}

async function verifyUnit(request: BuildRequest, identity: ReleaseIdentity, unit: ReleaseUnit, publicKey?: string): Promise<void> {
  const source = sourcesFor(request).find((source) => source.manifest.name === unit.name)
  if (!source || pluginFingerprint(source.dir, identity.builderCommit) !== unit.sourceDigest || source.manifest.version !== unit.version) throw new Error(`source changed after verification: ${unit.name}`)
  assertReleaseVersion(unit.version, request.releaseKind ?? 'live')
  Object.entries(unit.assets).forEach(([filename, digest]) => {
    if (basename(filename) !== filename || sha256(readFileSync(join(request.outputDir, filename))) !== digest) throw new Error(`verified asset changed: ${filename}`)
  })
  if (unit.atom.kind === 'collection') return
  const manifest = await verifyPackage(join(request.outputDir, `${unit.name}-${unit.version}.b3`), publicKey, identity.requireSignature)
  if (manifest.name !== unit.name || manifest.version !== unit.version) throw new Error(`verified package identity mismatch: ${unit.name}`)
}

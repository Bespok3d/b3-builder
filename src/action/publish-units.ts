// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonObject, ReleaseKind } from '../core/types.js'
import { atomFilename } from '../core/build/release-kind.js'
import { sha256 } from './verify-package.js'
import type { ReleaseEvidence, ReleaseUnit } from './release-evidence.js'
import type { ExistingRelease, ReleaseHost } from './github-release.js'
import { publishableAssetUrlMap } from './published-asset-url.js'
import type { RepositoryVisibility } from './published-asset-url.js'
import { finalizeDownloadUrl } from './inject-release-urls.js'
import type { PublishablePlugin } from './inject-release-urls.js'
import { finalizeDocUrls } from './release-doc-urls.js'

export function releaseTag(unit: ReleaseUnit, evidence?: ReleaseEvidence): string { return evidence?.releaseTag ?? `${unit.name}-v${unit.version}` }

export function releaseMarker(evidence: ReleaseEvidence, unit: ReleaseUnit): string {
  const identity = { source: evidence.sourceCommit, builder: evidence.builderCommit, unit: unit.name, version: unit.version, assets: unit.assets }
  return `Verified build ${sha256(Buffer.from(JSON.stringify(identity)))}`
}

export function preflightReleases(evidence: ReleaseEvidence, kind: ReleaseKind, host: ReleaseHost): void {
  evidence.units.filter((unit) => unit.atom.kind !== 'collection').forEach((unit) => {
    const target = host.target(releaseTag(unit, evidence))
    if (target !== undefined && target !== evidence.sourceCommit) throw new Error(`existing tag points at different source: ${releaseTag(unit, evidence)}`)
    const existing = host.inspect(releaseTag(unit, evidence))
    if (existing) inspectExisting(evidence, unit, kind, existing, host)
  })
}

function releaseKindOf(release: ExistingRelease): ReleaseKind {
  if (release.draft) return 'draft'
  return release.prerelease ? 'prerelease' : 'live'
}

function inspectExisting(evidence: ReleaseEvidence, unit: ReleaseUnit, kind: ReleaseKind, existing: ExistingRelease, host: ReleaseHost): void {
  const actualKind = releaseKindOf(existing)
  const promotion = actualKind === 'draft' && kind === 'prerelease'
  if (existing.target_commitish !== evidence.sourceCommit || existing.body !== releaseMarker(evidence, unit) || (actualKind !== kind && !promotion)) {
    throw new Error(`unexpected existing release: ${releaseTag(unit, evidence)}`)
  }
  existing.assets.forEach((asset) => {
    if (['index.json', 'index.json.sig'].includes(asset.name) && evidence.builtList) return
    if (asset.name === `${unit.name}.draft.atom.json` || asset.name === `${unit.name}.prerelease.atom.json` || asset.name === `${unit.name}.live.atom.json`) {
      verifyExistingAtom(evidence, unit, existing, asset.name, host)
      return
    }
    const expected = unit.assets[asset.name]
    if (!expected || sha256(host.download(asset)) !== expected) throw new Error(`unexpected existing release asset: ${asset.name}`)
  })
}

export function publishUnits(evidence: ReleaseEvidence, kind: ReleaseKind, outputDir: string, visibility: RepositoryVisibility, host: ReleaseHost): JsonObject[] {
  preflightReleases(evidence, kind, host)
  return evidence.units.map((unit) => publishUnit(evidence, unit, kind, outputDir, visibility, host))
}

function publishUnit(evidence: ReleaseEvidence, unit: ReleaseUnit, kind: ReleaseKind, outputDir: string, visibility: RepositoryVisibility, host: ReleaseHost): JsonObject {
  const tag = releaseTag(unit, evidence)
  if (unit.atom.kind === 'collection') return writeAtom(outputDir, { ...unit.atom, release_kind: kind })
  const existing = host.inspect(tag)
  if (!existing) host.create(tag, evidence.sourceCommit, kind, releaseMarker(evidence, unit))
  const present = new Set(existing?.assets.map((asset) => asset.name) ?? [])
  const missing = Object.keys(unit.assets).filter((filename) => !present.has(filename)).map((filename) => join(outputDir, filename))
  if (missing.length) host.upload(tag, missing)
  const uploaded = host.inspect(tag)
  if (!uploaded) throw new Error(`release missing after upload: ${tag}`)
  inspectExisting(evidence, unit, kind, uploaded, host)
  if (Object.keys(unit.assets).some((name) => !uploaded.assets.some((asset) => asset.name === name))) throw new Error(`release assets incomplete: ${tag}`)
  const atom = writeAtom(outputDir, finalizedUnitAtom(evidence.repository, unit, kind, visibility, uploaded))
  uploadMetadata(tag, atomFilename(atom), outputDir, host)
  if (existing?.draft && kind === 'prerelease') host.promote(existing)
  return atom
}

export function finalizedUnitAtom(repository: string, unit: ReleaseUnit, kind: ReleaseKind, visibility: RepositoryVisibility, release: ExistingRelease): JsonObject {
  const urls = publishableAssetUrlMap(release.assets, repository, release.tag_name, visibility === 'private' || kind === 'draft' ? 'private' : 'public')
  const finalized = finalizeDocUrls(finalizeDownloadUrl(unit.atom as unknown as PublishablePlugin, urls), urls)
  return { ...finalized, release_kind: kind } as JsonObject
}

function verifyExistingAtom(evidence: ReleaseEvidence, unit: ReleaseUnit, release: ExistingRelease, filename: string, host: ReleaseHost): void {
  const asset = release.assets.find((asset) => asset.name === filename)!
  const atom = JSON.parse(host.download(asset).toString('utf8')) as JsonObject
  const kind = atom.release_kind as ReleaseKind
  if (!['draft', 'prerelease', 'live'].includes(kind) || atomFilename(atom) !== filename) throw new Error(`unexpected existing atom: ${filename}`)
  const visibility = release.assets.some((published) => published.url === atom.download_url) ? 'private' : 'public'
  const expected = finalizedUnitAtom(evidence.repository, unit, kind, visibility, release)
  if (JSON.stringify(atom) !== JSON.stringify(expected)) throw new Error(`existing atom differs: ${filename}`)
}

function writeAtom(outputDir: string, atom: JsonObject): JsonObject {
  writeFileSync(join(outputDir, atomFilename(atom)), `${JSON.stringify(atom, null, 2)}\n`)
  return atom
}

export function uploadMetadata(tag: string, filename: string, outputDir: string, host: ReleaseHost): void {
  const asset = host.inspect(tag)?.assets.find((asset) => asset.name === filename)
  const bytes = readFileSync(join(outputDir, filename))
  if (asset) {
    if (!host.download(asset).equals(bytes)) throw new Error(`existing metadata differs: ${filename}`)
    return
  }
  host.upload(tag, [join(outputDir, filename)])
  const published = host.inspect(tag)?.assets.find((asset) => asset.name === filename)
  if (!published || !host.download(published).equals(bytes)) throw new Error(`uploaded metadata differs: ${filename}`)
}

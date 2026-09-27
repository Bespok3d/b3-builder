// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonObject } from '../core/types.js'
import { publicHalfOfSigningKey, signDetached, verifyDetached } from '../core/build/sign-bytes.js'
import type { ReleaseEvidence } from './release-evidence.js'
import type { ReleaseHost } from './github-release.js'
import { releaseTag, uploadMetadata } from './publish-units.js'
import { mergePublishedList } from './published-baseline.js'

export async function publishList(evidence: ReleaseEvidence, atoms: JsonObject[], outputDir: string, key: string, host: ReleaseHost): Promise<void> {
  if (evidence.units.every((unit) => unit.atom.kind === 'collection')) throw new Error('selected list update has no package release to host it')
  if (!evidence.baseline || !evidence.builtList) throw new Error('verified Live list baseline or built list missing')
  const merged = mergePublishedList(evidence.builtList, atoms, evidence.baseline)
  const bytes = Buffer.from(`${JSON.stringify(merged, null, 2)}\n`)
  const publicKey = await publicHalfOfSigningKey(key)
  writeFileSync(join(outputDir, 'index.json'), bytes)
  for (const unit of evidence.units.filter((unit) => unit.atom.kind !== 'collection')) {
    const tag = releaseTag(unit, evidence)
    await placeSignature(tag, outputDir, bytes, key, publicKey, host)
    uploadMetadata(tag, 'index.json', outputDir, host)
    uploadMetadata(tag, 'index.json.sig', outputDir, host)
  }
}

async function placeSignature(tag: string, outputDir: string, bytes: Buffer, key: string, publicKey: string, host: ReleaseHost): Promise<void> {
  const signatureAsset = host.inspect(tag)?.assets.find((asset) => asset.name === 'index.json.sig')
  const signature = signatureAsset ? host.download(signatureAsset).toString('utf8') : await signDetached(bytes, key)
  if (!await verifyDetached(bytes, signature, publicKey)) throw new Error('published list signature differs from verified bytes')
  writeFileSync(join(outputDir, 'index.json.sig'), signature)
}

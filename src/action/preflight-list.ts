// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReleaseEvidence } from './release-evidence.js'
import type { ExistingRelease, ReleaseHost } from './github-release.js'
import type { RepositoryVisibility } from './published-asset-url.js'
import { finalizedUnitAtom, releaseTag } from './publish-units.js'
import { mergePublishedList } from './published-baseline.js'
import { publicHalfOfSigningKey, verifyDetached } from '../core/build/sign-bytes.js'

export async function preflightPublishedList(evidence: ReleaseEvidence, key: string, visibility: RepositoryVisibility, host: ReleaseHost): Promise<void> {
  const releases = evidence.units.filter((unit) => unit.atom.kind !== 'collection').map((unit) => host.inspect(releaseTag(unit)))
  const withMetadata = releases.filter((release): release is ExistingRelease => Boolean(release?.assets.some((asset) => ['index.json', 'index.json.sig'].includes(asset.name))))
  if (!withMetadata.length) return
  if (releases.some((release) => !release)) throw new Error('existing list metadata precedes a missing selected release')
  if (!evidence.builtList || !evidence.baseline) throw new Error('existing list has no verified baseline')
  const atoms = evidence.units.map((unit) => unit.atom.kind === 'collection' ? { ...unit.atom, release_kind: 'live' } : finalizedUnitAtom(evidence.repository, unit, 'live', visibility, host.inspect(releaseTag(unit))!))
  const bytes = Buffer.from(`${JSON.stringify(mergePublishedList(evidence.builtList, atoms, evidence.baseline), null, 2)}\n`)
  const publicKey = await publicHalfOfSigningKey(key)
  await Promise.all(withMetadata.map((release) => verifyExistingList(release, bytes, publicKey, host)))
}

async function verifyExistingList(release: ExistingRelease, expected: Buffer, publicKey: string, host: ReleaseHost): Promise<void> {
  const index = release.assets.find((asset) => asset.name === 'index.json')
  const signature = release.assets.find((asset) => asset.name === 'index.json.sig')
  if (!index || !host.download(index).equals(expected)) throw new Error(`existing list bytes differ: ${release.tag_name}`)
  if (signature && !await verifyDetached(expected, host.download(signature).toString('utf8'), publicKey)) throw new Error(`existing list signature differs: ${release.tag_name}`)
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { JsonObject, ReleaseKind } from '../core/types.js'
import type { ReleaseEvidence } from './release-evidence.js'
import type { ReleaseHost } from './github-release.js'
import type { RepositoryVisibility } from './published-asset-url.js'
import { preflightReleases, publishUnits } from './publish-units.js'
import { preflightPublishedList } from './preflight-list.js'
import { publishList } from './publish-list.js'

export async function publishRelease(evidence: ReleaseEvidence, kind: ReleaseKind, outputDir: string, visibility: RepositoryVisibility, host: ReleaseHost, key?: string): Promise<JsonObject[]> {
  const liveList = kind === 'live' && evidence.builtList !== undefined
  preflightReleases(evidence, kind, host)
  if (liveList) {
    if (!key) throw new Error('Live list publication requires a signing key')
    if (evidence.units.every((unit) => unit.atom.kind === 'collection')) throw new Error('selected list update has no package release to host it')
    await preflightPublishedList(evidence, key, visibility, host)
  }
  const atoms = publishUnits(evidence, kind, outputDir, visibility, host)
  if (liveList) await publishList(evidence, atoms, outputDir, key!, host)
  return atoms
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { discoverRepoSources } from '../core/build/discovery.js'
import { assertReleaseVersion, releaseKind } from '../core/build/release-kind.js'
import type { ReleaseKind } from '../core/types.js'

export interface ConsumerEvent {
  eventName: string; refType: string; refName: string; repository: string; sourceCommit: string
  manifestPath: string; tagPrefix: string; prospectiveTag: string; selectedIds: string; expectedSource: string
  requestedKind: string; publish: boolean; builderCommit: string; registerCommit: string; preparedTag?: boolean
}
export interface ReleaseContext {
  repository: string; sourceCommit: string; tag: string; selectedIds: string[]; releaseKind: ReleaseKind
  builderCommit: string; registerCommit: string; publish: boolean; preparedOnly: boolean
}
interface UnitManifest { name: string; version: string }

export function consumerContext(event: ConsumerEvent, root: string): ReleaseContext {
  if (!['push', 'workflow_dispatch'].includes(event.eventName)) throw new Error('unsupported release event')
  const push = event.eventName === 'push'
  if (push && event.refType !== 'tag') throw new Error('publication push must name a tag')
  if (!push && (!event.prospectiveTag || event.expectedSource !== event.sourceCommit)) throw new Error('dispatch requires prospective tag and exact expected source SHA')
  const tag = push ? event.refName : event.prospectiveTag
  const manifests = consumerManifests(root, event.manifestPath)
  const selectedIds = push ? manifests.filter((manifest) => manifestTag(manifest, event.tagPrefix) === tag).map((manifest) => manifest.name) : event.selectedIds.trim().split(/\s+/).filter(Boolean)
  if (selectedIds.length !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(selectedIds[0]!)) throw new Error('one explicit selected unit is required per release tag')
  const matches = manifests.filter((manifest) => manifest.name === selectedIds[0])
  if (matches.length !== 1 || tag !== manifestTag(matches[0]!, event.tagPrefix)) throw new Error('prospective tag/selected unit/version mismatch')
  const kind = releaseKind(event.requestedKind || (matches[0]!.version.endsWith('-pre') ? 'draft' : 'live'))
  assertReleaseVersion(matches[0]!.version, kind)
  ;[event.sourceCommit, event.builderCommit, event.registerCommit].forEach((commit) => { if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('exact source and tooling pins required') })
  return { repository: event.repository, sourceCommit: event.sourceCommit, tag, selectedIds, releaseKind: kind, builderCommit: event.builderCommit, registerCommit: event.registerCommit, publish: push || event.publish, preparedOnly: Boolean(event.preparedTag) || (!push && event.publish) }
}
function consumerManifests(root: string, manifestPath: string): UnitManifest[] {
  if (!manifestPath) return discoverRepoSources(root).map((source) => source.manifest as unknown as UnitManifest)
  if (isAbsolute(manifestPath) || relative(resolve(root), resolve(root, manifestPath)).split('/').includes('..')) throw new Error('consumer manifest must be inside the source checkout')
  return [JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as UnitManifest]
}
function manifestTag(manifest: UnitManifest, template: string): string {
  const prefix = template.replace('{unit}', manifest.name)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(prefix)) throw new Error('explicit consumer tag prefix required')
  return `${prefix}-v${manifest.version}`
}

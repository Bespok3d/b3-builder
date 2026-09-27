// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { githubBytes } from './github-response.js'
import { execFileSync, spawnSync } from 'node:child_process'
import type { ReleaseKind } from '../core/types.js'
import type { ReleaseAssetAddress } from './published-asset-url.js'

export interface ExistingRelease {
  id: number; tag_name: string; target_commitish: string; draft: boolean; prerelease: boolean; body: string
  assets: ReleaseAssetAddress[]
}
export interface ReleaseHost {
  target(tag: string): string | undefined
  inspect(tag: string): ExistingRelease | undefined
  download(asset: ReleaseAssetAddress): Buffer
  create(tag: string, commit: string, kind: ReleaseKind, marker: string): void
  upload(tag: string, paths: string[]): void
  promote(release: ExistingRelease): void
}

export function createReleaseArgs(repository: string, tag: string, commit: string, kind: ReleaseKind, marker: string): string[] {
  const flags: Record<ReleaseKind, string[]> = { live: [], draft: ['--draft'], prerelease: ['--prerelease'] }
  return ['release', 'create', tag, '--repo', repository, '--target', commit, '--title', tag, '--notes', marker, ...flags[kind]]
}

export function githubReleaseHost(repository: string): ReleaseHost {
  function inspect(tag: string): ExistingRelease | undefined {
    const result = spawnSync('gh', ['api', `repos/${repository}/releases/tags/${tag}`], { encoding: 'utf8' })
    if (result.status === 0) return JSON.parse(result.stdout) as ExistingRelease
    if (result.stderr.includes('(HTTP 404)')) return undefined
    throw new Error(`release inspection failed: ${result.stderr}`)
  }
  return {
    inspect,
    target: (tag) => tagTarget(repository, tag),
    download: downloadAsset,
    create: (tag, commit, kind, marker) => { execFileSync('gh', createReleaseArgs(repository, tag, commit, kind, marker)) },
    upload: (tag, paths) => { execFileSync('gh', ['release', 'upload', tag, ...paths, '--repo', repository]) },
    promote: (release) => { execFileSync('gh', ['api', '--method', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', 'draft=false', '-F', 'prerelease=true']) },
  }
}

function tagTarget(repository: string, tag: string): string | undefined {
  const result = spawnSync('gh', ['api', `repos/${repository}/git/ref/tags/${tag}`], { encoding: 'utf8' })
  if (result.status !== 0) {
    if (result.stderr.includes('(HTTP 404)')) return undefined
    throw new Error(`tag inspection failed: ${result.stderr}`)
  }
  const reference = JSON.parse(result.stdout) as { object: { type: string; sha: string } }
  return peelTag(repository, reference.object, new Set())
}

function peelTag(repository: string, object: { type: string; sha: string }, visited: Set<string>): string {
  if (object.type === 'commit') return object.sha
  if (object.type !== 'tag' || visited.has(object.sha)) throw new Error('release tag does not resolve to a commit')
  visited.add(object.sha)
  const annotated = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/git/tags/${object.sha}`], { encoding: 'utf8' })) as { object: { type: string; sha: string } }
  return peelTag(repository, annotated.object, visited)
}

function downloadAsset(asset: ReleaseAssetAddress): Buffer {
  return githubBytes(['api', asset.url, '-H', 'Accept: application/octet-stream'])
}

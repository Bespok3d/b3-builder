// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { githubBytes } from './github-response.js'
import { spawnSync } from 'node:child_process'
import type { JsonObject } from '../core/types.js'
import { verifyDetached } from '../core/build/sign-bytes.js'
import { sha256 } from './verify-package.js'

export interface ListBaseline { index: JsonObject; digest: string }

export async function readLiveBaseline(repository: string, publicKey: string, allowEmpty: boolean, ownReleases: Record<string, string> = {}): Promise<ListBaseline> {
  const result = spawnSync('gh', ['api', `repos/${repository}/releases/latest`], { encoding: 'utf8' })
  if (result.status !== 0) {
    if (allowEmpty && result.stderr.includes('(HTTP 404)')) return { index: { plugins: [], collections: [] }, digest: 'empty' }
    throw new Error(`cannot read existing Live list: ${result.stderr}`)
  }
  const latest = JSON.parse(result.stdout) as BaselineRelease
  const release = priorBaselineRelease(repository, latest, ownReleases, allowEmpty)
  if (!release) return { index: { plugins: [], collections: [] }, digest: 'empty' }
  const indexAsset = release.assets.find((asset) => asset.name === 'index.json')
  const signatureAsset = release.assets.find((asset) => asset.name === 'index.json.sig')
  if (!indexAsset || !signatureAsset) throw new Error('existing Live list or signature is missing')
  const bytes = githubBytes(['api', indexAsset.url, '-H', 'Accept: application/octet-stream'])
  const signature = githubBytes(['api', signatureAsset.url, '-H', 'Accept: application/octet-stream']).toString('utf8')
  if (!await verifyDetached(bytes, signature, publicKey)) throw new Error('existing Live list signature is invalid')
  return { index: JSON.parse(bytes.toString('utf8')) as JsonObject, digest: sha256(bytes) }
}

export function mergePublishedList(built: JsonObject, selected: JsonObject[], baseline: JsonObject): JsonObject {
  const names = new Set(selected.map((atom) => atom.name))
  function entries(field: 'plugins' | 'collections'): JsonObject[] {
    const previous = (baseline[field] ?? []) as JsonObject[]
    const replacements = selected.filter((atom) => (atom.kind === 'collection') === (field === 'collections'))
    const builtEntries = (built[field] ?? []) as JsonObject[]
    return [...previous.filter((entry) => !names.has(entry.name)), ...replacements.map((atom) => {
      const builtEntry = builtEntries.find((entry) => entry.name === atom.name)
      if (!builtEntry) throw new Error(`selected list member missing: ${String(atom.name)}`)
      const { kind: _kind, require: _require, ...catalog } = atom
      return { ...builtEntry, ...catalog }
    })].sort((earlier, later) => String(earlier.name).localeCompare(String(later.name)))
  }
  return { ...built, plugins: entries('plugins'), collections: entries('collections') }
}

interface BaselineRelease { tag_name: string; body: string; draft: boolean; prerelease: boolean; assets: { name: string; url: string }[] }

function priorBaselineRelease(repository: string, latest: BaselineRelease, ownReleases: Record<string, string>, allowEmpty: boolean): BaselineRelease | undefined {
  if (!(latest.tag_name in ownReleases)) return latest
  if (latest.body !== ownReleases[latest.tag_name]) throw new Error('unexpected release replaced Live baseline')
  const releases = JSON.parse(githubBytes(['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`]).toString('utf8')) as BaselineRelease[][]
  const prior = releases.flat().find((release) => !release.draft && !release.prerelease && !(release.tag_name in ownReleases))
  if (!prior && !allowEmpty) throw new Error('prior Live baseline is missing')
  return prior
}

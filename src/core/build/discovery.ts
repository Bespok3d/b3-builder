import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BuildRequest, BuildUnit } from '../types.js'
import { isCollection } from './entry.js'
import { sourceFromDir } from './plugin-source.js'
import type { PluginSource } from './plugin-source.js'

// Discover the plugin source dirs a build packs. A `plugin` unit is one dir that itself holds a
// manifest.json; a `repo` unit is a dir of plugin dirs (every immediate subdir holding a manifest.json,
// one plugin per top-level dir, no nested discovery, every non-excluded plugin publishes). One entry
// point every step calls, so they cannot drift on which sources a build covers.
export function discoverSources(unit: BuildUnit, sourceDir: string, exclude: string[] = []): PluginSource[] {
  if (unit === 'plugin') return [sourceFromDir(sourceDir)]
  return discoverRepoSources(sourceDir, exclude)
}

// Discover from a request, so every step resolves the SAME source set (unit, sourceDir, AND the
// excluded dirs) through one call and cannot drift. Exclusion is a repo-build concern; a single-plugin
// build is one named dir with nothing to exclude.
export function sourcesFor(request: BuildRequest): PluginSource[] {
  const exclude = request.unit === 'repo' ? request.exclude ?? [] : []
  return discoverSources(request.unit, request.sourceDir, exclude)
}

// A repo of plugin dirs. An excluded dir is skipped outright (caller curation, e.g. a dev-only variant
// that must never publish). A kind:collection member (e.g. all-the-tags/all-the-tags) is also excluded:
// it ships no files/ to pack, and the sub-list schema has no collections bucket. Unifying a repo's
// bespoke collection-atom shape into the core is later scope (the pilot migration), so for now a
// collection in a repo is simply not published as an atom.
export function discoverRepoSources(sourceDir: string, exclude: string[] = []): PluginSource[] {
  const excludedDirs = new Set(exclude)
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !excludedDirs.has(entry.name) && existsSync(join(sourceDir, entry.name, 'manifest.json')))
    .map((entry) => sourceFromDir(join(sourceDir, entry.name)))
    .filter((source) => !isCollection(source.manifest))
}

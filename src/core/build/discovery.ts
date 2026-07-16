import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BuildRequest, BuildUnit } from '../types.js'
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
// that must never publish). A kind:collection dir (e.g. all-the-tags/all-the-tags) IS discovered: it is
// a published source like any other, it just has no payload, so the pack step is the one place that
// passes over it (see steps/pack.ts) while the registry step routes it into collections[].
export function discoverRepoSources(sourceDir: string, exclude: string[] = []): PluginSource[] {
  const excludedDirs = new Set(exclude)
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !excludedDirs.has(entry.name) && existsSync(join(sourceDir, entry.name, 'manifest.json')))
    .map((entry) => sourceFromDir(join(sourceDir, entry.name)))
}

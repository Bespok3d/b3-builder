// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dirent } from 'node:fs'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonObject } from '../types.js'
import { asString } from './json.js'

// A discovered plugin (or collection) source dir: its manifest .name (the identity the index and the
// staged-doc dir key on, independent of directory layout), the dir itself, and the parsed manifest.
export interface PluginSource {
  name: string
  dir: string
  manifest: JsonObject
}

const DISCOVERY_MAX_DEPTH = 4
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', '.github', 'files', 'doc', 'scripts'])

export function readManifest(dir: string): JsonObject {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as JsonObject
}

// A PluginSource built from a dir already known to hold a manifest.json: the one place every discovery
// path (a single plugin dir, or a repo of plugin dirs) constructs this shape, so they cannot drift on it.
export function sourceFromDir(dir: string): PluginSource {
  const manifest = readManifest(dir)
  return { name: asString(manifest.name), dir, manifest }
}

// Recursively find every plugin source dir (one holding a manifest.json) under root, bounded by depth
// and skipping build/scaffold dirs. A plugin dir is a leaf: once a manifest is found, stop descending.
export function findManifestDirs(root: string, depth = DISCOVERY_MAX_DEPTH): string[] {
  if (depth < 0) return []
  const entries: Dirent[] = readdirSync(root, { withFileTypes: true })
  if (hasManifestFile(entries)) return [root]
  return subdirs(root, entries).flatMap((dir) => findManifestDirs(dir, depth - 1))
}

function hasManifestFile(entries: Dirent[]): boolean {
  return entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')
}

function subdirs(root: string, entries: Dirent[]): string[] {
  return entries
    .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
    .map((entry) => join(root, entry.name))
}

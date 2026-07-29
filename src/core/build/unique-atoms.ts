// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { atomKey } from './entry.js'
import type { PluginSource } from './plugin-source.js'

// Two manifests resolving to the same name@version would claim one download_url (and one atom) for two
// different file trees: one silently shadows the other. Always a misconfiguration, so fail loudly
// rather than let a build silently ship the wrong content for one of them. Applied on the repo-of-dirs
// path, which packs every plugin dir and previously had no such guard.
export function assertUniqueAtoms(sources: PluginSource[]): void {
  const keys = sources.map((source) => atomKey(source.manifest))
  const duplicates = [...new Set(keys.filter((key, position) => keys.indexOf(key) !== position))]
  if (duplicates.length > 0) {
    throw new Error(`duplicate atoms (same name and version from more than one source dir): ${duplicates.join(', ')}`)
  }
}

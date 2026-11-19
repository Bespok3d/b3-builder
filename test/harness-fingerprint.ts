// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { JsonObject, JsonValue } from '../src/core/index.js'

// The build `fingerprint` is OUT of the equivalence set, on the packed manifest, on every atom and on
// every sub-list plugin entry, and this is a divergence of the same kind as `assembled_at`, not a
// weakening. The value digests the builder version and the source tree (see build/fingerprint.ts): the
// legacy scripts never wrote it, a frozen fixture could not carry it, and any builder release moves it.
// What the rail pins is that everything else reproduces the legacy output; that every package, atom and
// sub-list entry carries the one correct value is pinned directly instead, by package-fingerprint.test.ts.
export function withoutBuildFingerprint(entry: JsonObject): JsonObject {
  const { fingerprint: _fingerprint, ...legacyShape } = entry
  return legacyShape
}

export function withoutBuildFingerprints(atoms: JsonObject[]): JsonObject[] {
  return atoms.map(withoutBuildFingerprint)
}

export function subListWithoutBuildFingerprints(subList: JsonObject): JsonObject {
  const plugins = subList.plugins
  if (!Array.isArray(plugins)) return subList
  return { ...subList, plugins: plugins.map(pluginEntryWithoutFingerprint) }
}

function pluginEntryWithoutFingerprint(pluginEntry: JsonValue): JsonValue {
  if (typeof pluginEntry !== 'object' || pluginEntry === null || Array.isArray(pluginEntry)) return pluginEntry
  return withoutBuildFingerprint(pluginEntry)
}

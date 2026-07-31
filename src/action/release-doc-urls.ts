// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

// A store page has to show the release notes of the version it is offering, so every release carries
// its plugin's CHANGELOG.md and README.md as assets beside the .b3 and the catalog entry points at
// them. The core writes both fields as source-relative placeholders because it is GitHub-agnostic (the
// hard boundary, ADR-0041); this is the Action face that swaps in the real asset URL, out of the same
// map the download_url finalize reads.

export interface DocumentedEntry {
  name?: unknown
  version?: unknown
  changelog_url?: unknown
  doc_url?: unknown
  [field: string]: unknown
}

const DOC_ASSET_BY_FIELD: Record<string, string> = {
  changelog_url: 'CHANGELOG.md',
  doc_url: 'README.md',
}

// The .b3 asset is named <plugin>-<version>.b3 and a doc asset follows the same shape. One release
// holds one plugin, so the plugin and version are redundant inside it, but the URL map is shared by
// every plugin in a repo run and the key has to be unique across all of them. action.yml mints the
// same name in bash; release-doc-urls.test.ts fails if the two ever drift.
export function docAssetName(pluginName: string, version: string, docFilename: string): string {
  return `${pluginName}-${version}-${docFilename}`
}

// A collection publishes no release (no payload, so nothing to release), so its doc assets are absent
// from the map and its entry keeps the placeholder the core wrote, which is the truthful answer: there
// is no released copy to point at.
export function finalizeDocUrls<EntryShape extends DocumentedEntry>(
  entry: EntryShape,
  assetUrlByFilename: Record<string, string>,
): EntryShape {
  const pluginName = typeof entry.name === 'string' ? entry.name : ''
  const version = typeof entry.version === 'string' ? entry.version : ''
  if (pluginName === '' || version === '') return entry

  const published = Object.entries(DOC_ASSET_BY_FIELD)
    .filter(([field]) => entry[field] !== undefined)
    .map(([field, docFilename]) => [field, assetUrlByFilename[docAssetName(pluginName, version, docFilename)]])
    .filter(([, assetUrl]) => assetUrl !== undefined)

  return { ...entry, ...Object.fromEntries(published) }
}

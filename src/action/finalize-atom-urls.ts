#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finalizeDownloadUrl } from './inject-release-urls.js'
import type { PublishablePlugin } from './inject-release-urls.js'

// Finalize the built atoms' placeholder download_url values with the real GitHub release asset URLs,
// in place in the output dir. The registry step writes every atom with the local .b3 filename as its
// download_url (the core stays GitHub-agnostic, ADR-0041); this Action helper swaps in the release
// asset URL collected while uploading, so each atom is publishable as-is. An atoms-only repo (no
// sub-list) registers by copying these finalized atoms into an index-of-lists' atom pool.

export function finalizeAtomUrls(outputDir: string, assetUrlByFilename: Record<string, string>): string[] {
  const atomFiles = readdirSync(outputDir).filter((entry) => entry.endsWith('.atom.json'))
  const finalized = atomFiles.filter((filename) => finalizeAtomFile(join(outputDir, filename), assetUrlByFilename))
  return finalized
}

// A collection atom carries no download_url (it ships no payload and therefore no .b3), so there is
// nothing to finalize and it is left as built.
function finalizeAtomFile(atomPath: string, assetUrlByFilename: Record<string, string>): boolean {
  const atom = JSON.parse(readFileSync(atomPath, 'utf8')) as PublishablePlugin
  if (atom.download_url === undefined) return false
  const finalized = finalizeDownloadUrl(atom, assetUrlByFilename)
  writeFileSync(atomPath, `${JSON.stringify(finalized, null, 2)}\n`)
  return true
}

function main(argv: string[]): void {
  const [outDir, mapPath] = argv.slice(2)
  if (outDir === undefined || mapPath === undefined) {
    throw new Error('usage: finalize-atom-urls <out-dir> <asset-url-map.json>')
  }
  const assetUrlByFilename = JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, string>
  const finalized = finalizeAtomUrls(outDir, assetUrlByFilename)
  process.stdout.write(`Finalized ${finalized.length} atom download_url(s) in ${outDir}\n`)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('finalize-atom-urls.js')) {
  try {
    main(process.argv)
  } catch (error: unknown) {
    process.stderr.write(`finalize-atom-urls failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

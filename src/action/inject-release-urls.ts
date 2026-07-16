#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

// Finalize a built sub-list's placeholder download_url values with the real GitHub release asset URLs.
// b3-builder's index step deliberately writes each plugin's download_url as the local .b3 filename and
// defers the real URL to CI (see build/co-repo-index buildAtoms: "the real CI-injected release URL is a
// later packet"). This Action helper IS that CI step: given the built index.json and a
// { "<name>-<version>.b3": "<release asset url>" } map collected while uploading each .b3 to its release,
// it swaps every placeholder for its real URL and writes the publishable index.json. It lives in the
// Action face, never the core, because a GitHub release asset URL is a CI artifact the tool must never
// bake in (the hard boundary, ADR-0041): the core stays GitHub-agnostic, the Action fills the field.

interface PublishablePlugin {
  download_url: string
  [field: string]: unknown
}

interface PublishableSubList {
  plugins: PublishablePlugin[]
  [field: string]: unknown
}

export function injectReleaseUrls(
  subList: PublishableSubList,
  assetUrlByFilename: Record<string, string>,
): PublishableSubList {
  const finalized = subList.plugins.map((plugin) => finalizeDownloadUrl(plugin, assetUrlByFilename))
  return { ...subList, plugins: finalized }
}

function finalizeDownloadUrl(
  plugin: PublishablePlugin,
  assetUrlByFilename: Record<string, string>,
): PublishablePlugin {
  const releaseUrl = assetUrlByFilename[plugin.download_url]
  if (releaseUrl === undefined) {
    throw new Error(
      `no release asset URL for ${plugin.download_url}: its .b3 was not uploaded to a release, so the ` +
        'catalog entry would point at a bare filename. Every packed plugin must have a release before its index is published.',
    )
  }
  return { ...plugin, download_url: releaseUrl }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main(argv: string[]): void {
  const [indexPath, mapPath, outPath] = argv.slice(2)
  if (indexPath === undefined || mapPath === undefined || outPath === undefined) {
    throw new Error('usage: inject-release-urls <built-index.json> <asset-url-map.json> <publishable-index.json>')
  }
  const subList = readJson(indexPath) as PublishableSubList
  const assetUrlByFilename = readJson(mapPath) as Record<string, string>
  const finalized = injectReleaseUrls(subList, assetUrlByFilename)
  writeFileSync(outPath, `${JSON.stringify(finalized, null, 2)}\n`)
  process.stdout.write(`Wrote ${outPath} (${finalized.plugins.length} download_url(s) finalized)\n`)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('inject-release-urls.js')) {
  try {
    main(process.argv)
  } catch (error: unknown) {
    process.stderr.write(`inject-release-urls failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

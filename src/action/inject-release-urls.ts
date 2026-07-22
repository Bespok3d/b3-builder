#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import type { JsonValue } from '../core/types.js'
import { writeSignedIndexFile } from '../core/build/signed-index.js'

// Finalize a built sub-list's placeholder download_url values with the real GitHub release asset URLs.
// b3-builder's index step deliberately writes each plugin's download_url as the local .b3 filename and
// defers the real URL to CI (see build/co-repo-index buildAtoms: "the real CI-injected release URL is a
// later packet"). This Action helper IS that CI step: given the built index.json and a
// { "<name>-<version>.b3": "<release asset url>" } map collected while uploading each .b3 to its release,
// it swaps every placeholder for its real URL and writes the publishable index.json. It lives in the
// Action face, never the core, because a GitHub release asset URL is a CI artifact the tool must never
// bake in (the hard boundary, ADR-0041): the core stays GitHub-agnostic, the Action fills the field.

export interface PublishablePlugin {
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

export function finalizeDownloadUrl(
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

// A detached signature covers the exact bytes a reader fetches, so the list is signed HERE and not in the
// index step: the index step's output still carries placeholder download_urls, and this step rewrites them.
// Signing before the rewrite produced a signature over bytes nobody is ever served, which the app reads as
// tampering rather than as an unsigned list.
function signingKeyFromEnvironment(): string | undefined {
  return process.env.B3D_SIGNING_KEY === undefined || process.env.B3D_SIGNING_KEY === ''
    ? undefined
    : process.env.B3D_SIGNING_KEY
}

export async function publishSignedSubList(
  builtIndexPath: string,
  assetUrlMapPath: string,
  publishedIndexPath: string,
  armoredPrivateKey: string | undefined,
): Promise<{ finalizedCount: number; signed: boolean }> {
  const subList = readJson(builtIndexPath) as PublishableSubList
  const assetUrlByFilename = readJson(assetUrlMapPath) as Record<string, string>
  const finalized = injectReleaseUrls(subList, assetUrlByFilename)
  const signed = await writeSignedIndexFile(publishedIndexPath, finalized as unknown as JsonValue, armoredPrivateKey)

  return { finalizedCount: finalized.plugins.length, signed }
}

async function main(argv: string[]): Promise<void> {
  const [indexPath, mapPath, outPath] = argv.slice(2)
  if (indexPath === undefined || mapPath === undefined || outPath === undefined) {
    throw new Error('usage: inject-release-urls <built-index.json> <asset-url-map.json> <publishable-index.json>')
  }
  const published = await publishSignedSubList(indexPath, mapPath, outPath, signingKeyFromEnvironment())
  const proof = published.signed ? 'signed' : 'unsigned'
  process.stdout.write(`Wrote ${outPath} (${published.finalizedCount} download_url(s) finalized, ${proof})\n`)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('inject-release-urls.js')) {
  main(process.argv).catch((error: unknown) => {
    process.stderr.write(`inject-release-urls failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}

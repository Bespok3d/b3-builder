#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'

// Which address a published catalog entry carries for a released asset.
//
// A GitHub asset id is minted per upload, so `gh release upload --clobber` of the same tag and
// filename puts the file back at a NEW id and the address a published entry already carries answers
// 404 forever. The tag-and-filename address keeps answering across that re-upload, so a public
// publisher gets it. A private repo's browser address answers 404 to a token request as well, so a
// private publisher keeps the API asset address, which is the one a token plus
// Accept: application/octet-stream can actually download.
//
// This lives on the Action face, never the core: which address a release asset has is a CI artifact
// the tool must never bake in (the hard boundary, ADR-0041).

export interface ReleaseAssetAddress {
  name: string
  url: string
}

export type RepositoryVisibility = 'public' | 'private'

const GITHUB_WEB_BASE = 'https://github.com'

// Keyed on the release tag and the asset filename, which is what makes it survive a re-upload.
export function durableAssetUrl(repository: string, releaseTag: string, assetName: string): string {
  return `${GITHUB_WEB_BASE}/${repository}/releases/download/${releaseTag}/${assetName}`
}

export function publishableAssetUrl(
  asset: ReleaseAssetAddress,
  repository: string,
  releaseTag: string,
  visibility: RepositoryVisibility,
): string {
  return visibility === 'private' ? asset.url : durableAssetUrl(repository, releaseTag, asset.name)
}

export function publishableAssetUrlMap(
  assets: ReleaseAssetAddress[],
  repository: string,
  releaseTag: string,
  visibility: RepositoryVisibility,
): Record<string, string> {
  return Object.fromEntries(
    assets.map((asset) => [asset.name, publishableAssetUrl(asset, repository, releaseTag, visibility)]),
  )
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function requireVisibility(value: string | undefined): RepositoryVisibility {
  if (value === 'public' || value === 'private') return value
  throw new Error(`visibility must be "public" or "private", got ${value ?? 'nothing'}`)
}

function main(argv: string[]): void {
  const [assetsPath, repository, releaseTag, visibilityArg] = argv.slice(2)
  if (assetsPath === undefined || repository === undefined || releaseTag === undefined || visibilityArg === undefined) {
    throw new Error('usage: published-asset-url <release-assets.json> <owner/repo> <release-tag> <public|private>')
  }
  const assets = readJson(assetsPath) as ReleaseAssetAddress[]
  const map = publishableAssetUrlMap(assets, repository, releaseTag, requireVisibility(visibilityArg))
  process.stdout.write(`${JSON.stringify(map)}\n`)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('published-asset-url.js')) {
  try {
    main(process.argv)
  } catch (error: unknown) {
    process.stderr.write(`published-asset-url failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

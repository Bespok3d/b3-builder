// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { ExistingRelease, ReleaseHost } from '../../src/action/github-release.js'
import type { ReleaseAssetAddress } from '../../src/action/published-asset-url.js'

export class FixtureHost implements ReleaseHost {
  constructor(private readonly assetBase = 'https://api.github.com/repos/test/repo/releases/assets') {}
  releases = new Map<string, ExistingRelease>()
  bytes = new Map<string, Buffer>()
  effects: string[] = []
  target(tag: string): string | undefined { return this.releases.get(tag)?.target_commitish }
  inspect(tag: string): ExistingRelease | undefined { return this.releases.get(tag) }
  download(asset: ReleaseAssetAddress): Buffer { return this.bytes.get(asset.url)! }
  create(tag: string, commit: string, kind: string, body: string): void {
    this.effects.push(`create ${tag}`)
    this.releases.set(tag, { id: this.releases.size + 1, tag_name: tag, target_commitish: commit, draft: kind === 'draft', prerelease: kind === 'prerelease', body, assets: [] })
  }
  upload(tag: string, paths: string[]): void {
    paths.forEach((path) => {
      const name = basename(path)
      this.effects.push(`upload ${tag}/${name}`)
      const url = `${this.assetBase}/${this.bytes.size + 1}`
      this.bytes.set(url, readFileSync(path))
      this.releases.get(tag)!.assets.push({ name, url })
    })
  }
  promote(release: ExistingRelease): void {
    this.effects.push(`promote ${release.id}`)
    release.draft = false
    release.prerelease = true
  }
}

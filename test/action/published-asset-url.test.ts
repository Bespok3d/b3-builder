// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  durableAssetUrl,
  publishableAssetUrl,
  publishableAssetUrlMap,
} from '../../src/action/published-asset-url.js'
import type { ReleaseAssetAddress } from '../../src/action/published-asset-url.js'

const REPOSITORY = 'Bespok3d/u1-motion-tweaks'
const RELEASE_TAG = 'tmc-autotune-v0.1.1'
const DURABLE_FORM = 'https://github.com/Bespok3d/u1-motion-tweaks/releases/download/tmc-autotune-v0.1.1/tmc-autotune-0.1.1.b3'

const TMC_PACKAGE: ReleaseAssetAddress = {
  name: 'tmc-autotune-0.1.1.b3',
  // A real upload of this asset id: 510437054 was published first and 536914264 replaced it, which
  // is exactly the move that left the published entry pointing at a dead address.
  url: 'https://api.github.com/repos/Bespok3d/u1-motion-tweaks/releases/assets/510437054',
}

// A published entry used to carry the release asset's API address, and that address is minted per
// upload, so a publisher re-uploading a release asset orphaned every entry that named it. These pin
// the shape the publish pipeline emits instead, and fail if the asset-id form ever comes back for a
// public publisher.
describe('publishableAssetUrl', () => {
  it('gives a public publisher the tag-and-filename address, never the asset-id form', () => {
    const published = publishableAssetUrl(TMC_PACKAGE, REPOSITORY, RELEASE_TAG, 'public')
    expect(published).toBe(DURABLE_FORM)
    expect(published).not.toContain('/releases/assets/')
  })

  it('keeps the asset-id address for a private publisher, whose browser address a token cannot fetch', () => {
    const published = publishableAssetUrl(TMC_PACKAGE, REPOSITORY, RELEASE_TAG, 'private')
    expect(published).toBe(TMC_PACKAGE.url)
  })

  it('holds still when the same asset is re-uploaded and gets a new id', () => {
    const reuploadedAsset: ReleaseAssetAddress = {
      ...TMC_PACKAGE,
      url: 'https://api.github.com/repos/Bespok3d/u1-motion-tweaks/releases/assets/536914264',
    }
    expect(publishableAssetUrl(reuploadedAsset, REPOSITORY, RELEASE_TAG, 'public')).toBe(
      publishableAssetUrl(TMC_PACKAGE, REPOSITORY, RELEASE_TAG, 'public'),
    )
    expect(publishableAssetUrl(reuploadedAsset, REPOSITORY, RELEASE_TAG, 'public')).toBe(DURABLE_FORM)
  })
})

describe('durableAssetUrl', () => {
  it('is keyed on the release tag and the asset filename', () => {
    expect(durableAssetUrl('Bespok3d/spoolman-klipper-helper', 'spoolman-v0.1.36', 'spoolman-0.1.36-README.md')).toBe(
      'https://github.com/Bespok3d/spoolman-klipper-helper/releases/download/spoolman-v0.1.36/spoolman-0.1.36-README.md',
    )
  })
})

describe('publishableAssetUrlMap', () => {
  it('keys every released asset by its filename so the finalize step can look it up', () => {
    const assets: ReleaseAssetAddress[] = [
      TMC_PACKAGE,
      {
        name: 'tmc-autotune-0.1.1-README.md',
        url: 'https://api.github.com/repos/Bespok3d/u1-motion-tweaks/releases/assets/510437118',
      },
    ]
    const map = publishableAssetUrlMap(assets, REPOSITORY, RELEASE_TAG, 'public')
    expect(Object.keys(map).sort()).toEqual(['tmc-autotune-0.1.1-README.md', 'tmc-autotune-0.1.1.b3'])
    expect(map['tmc-autotune-0.1.1.b3']).toBe(DURABLE_FORM)
    expect(map['tmc-autotune-0.1.1-README.md']).toBe(
      'https://github.com/Bespok3d/u1-motion-tweaks/releases/download/tmc-autotune-v0.1.1/tmc-autotune-0.1.1-README.md',
    )
    expect(Object.values(map).some((address) => address.includes('/releases/assets/'))).toBe(false)
  })
})

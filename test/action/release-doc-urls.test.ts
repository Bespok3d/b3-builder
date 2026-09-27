// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { finalizeDocUrls } from '../../src/action/release-doc-urls.js'
import type { DocumentedEntry } from '../../src/action/release-doc-urls.js'

const ASSET_URL = 'https://api.github.com/repos/x/y/releases/assets/7'
const README_URL = 'https://api.github.com/repos/x/y/releases/assets/8'

// A catalog entry used to point at a source-relative path for its notes, which nothing could fetch, so
// a store page could only ever show the copy compiled into the app. These finalize the two doc fields
// against the release that carries them, which is what lets a plugin release change its own store page.
describe('finalizeDocUrls', () => {
  const camera = {
    name: 'camera-hw-accel',
    version: '0.1.10',
    changelog_url: 'camera-hw-accel/doc/CHANGELOG.md',
    doc_url: 'https://github.com/org/repo/blob/main/camera-hw-accel/doc/README.md',
  }

  it('points the notes and the readme at the assets of the release being published', () => {
    const finalized = finalizeDocUrls(camera, {
      'camera-hw-accel-0.1.10-CHANGELOG.md': ASSET_URL,
      'camera-hw-accel-0.1.10-README.md': README_URL,
    })
    expect(finalized.changelog_url).toBe(ASSET_URL)
    expect(finalized.doc_url).toBe(README_URL)
  })

  it('keeps the notes of another version out of this entry', () => {
    const finalized = finalizeDocUrls(camera, { 'camera-hw-accel-0.1.9-CHANGELOG.md': ASSET_URL })
    expect(finalized.changelog_url).toBe(camera.changelog_url)
  })

  it('leaves a collection as built: it publishes no release, so there is no asset to point at', () => {
    const collection = { name: 'all-the-tags', version: '0.2.0', kind: 'collection', doc_url: 'all-the-tags/doc/README.md' }
    expect(finalizeDocUrls(collection, {}).doc_url).toBe('all-the-tags/doc/README.md')
  })

  it('adds no field an entry did not declare', () => {
    const noNotes: DocumentedEntry = { name: 'webcam', version: '1.0.0', doc_url: 'webcam/doc/README.md' }
    const finalized = finalizeDocUrls(noNotes, { 'webcam-1.0.0-CHANGELOG.md': ASSET_URL })
    expect(finalized.changelog_url).toBeUndefined()
  })
})


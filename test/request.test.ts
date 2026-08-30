// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { publisherRequest } from '../src/core/request.js'
import { isListIdentity } from '../src/core/types.js'

function repoInputs(extra: Record<string, unknown>) {
  return {
    unit: 'repo' as const,
    sourceDir: '/src',
    outputDir: '/out',
    atomRepo: 'Bespok3d/u1-extras',
    exclude: [],
    providerSources: [],
    skipUnchanged: false,
    bake: false,
    ...extra,
  }
}

describe('publisherRequest list author', () => {
  it('threads listAuthor onto the list identity alongside name and publisher', () => {
    const request = publisherRequest(repoInputs({ listName: 'Bespok3d Official', listPublisher: 'FINGERPRINT', listAuthor: 'bespoked' }))
    if (request.unit !== 'repo' || !isListIdentity(request.identity)) throw new Error('expected a repo list build')
    expect(request.identity.listAuthor).toBe('bespoked')
  })

  it('rejects a list author with no list name and publisher behind it', () => {
    expect(() => publisherRequest(repoInputs({ listAuthor: 'bespoked' }))).toThrow(/list-author/)
  })
})

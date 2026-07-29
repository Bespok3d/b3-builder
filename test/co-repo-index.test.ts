// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../src/core/types.js'
import { assembleSubList } from '../src/core/build/co-repo-index.js'

function pluginAtom(name: string): JsonObject {
  return { name, version: '0.1.0', provides: [], require: [], updated_at: '2026-07-23' }
}

describe('assembleSubList author', () => {
  it('emits author, after publisher, when a list author is supplied', () => {
    const list = assembleSubList([pluginAtom('fluidd')], 'Bespok3d Official', 'FINGERPRINT', 'bespoked')
    expect(list.author).toBe('bespoked')
    expect(Object.keys(list)).toEqual(['schema_version', 'name', 'publisher', 'author', 'updated', 'plugins', 'lists'])
  })

  it('omits author entirely when no list author is supplied (unchanged shape)', () => {
    const list = assembleSubList([pluginAtom('fluidd')], 'Bespok3d Official', 'FINGERPRINT')
    expect('author' in list).toBe(false)
  })
})

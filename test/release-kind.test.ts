// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { assertReleaseVersion, releaseKind, selectedAtoms } from '../src/core/build/release-kind.js'

it.each(['draft', 'prerelease', 'live'] as const)('enforces terminal -pre pairing for %s', (kind) => {
  const accepted = kind === 'live' ? '1.0.0' : '1.0.0-pre'
  const refused = kind === 'live' ? '1.0.0-pre' : '1.0.0'
  expect(() => assertReleaseVersion(accepted, kind)).not.toThrow()
  expect(() => assertReleaseVersion(refused, kind)).toThrow('terminal -pre')
})
it('defaults to Live, refuses unknown kinds and invalid selected sets', () => {
  expect(releaseKind()).toBe('live')
  expect(() => releaseKind('beta')).toThrow('invalid release kind')
  expect(() => selectedAtoms([{ name: 'one' }], ['missing'])).toThrow('missing')
  expect(() => selectedAtoms([{ name: 'one' }], ['one', 'one'])).toThrow('unique')
})

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { consumerContext } from '../../src/action/release-context.js'
import type { ConsumerEvent } from '../../src/action/release-context.js'
import { fixtureFile } from './consumer-rehearsal-fixtures.js'

function dispatch(): ConsumerEvent {
  return { eventName: 'workflow_dispatch', refType: 'branch', refName: 'candidate', repository: 'outside/publisher', sourceCommit: '1'.repeat(40), expectedSource: '1'.repeat(40), builderCommit: '2'.repeat(40), registerCommit: '3'.repeat(40), manifestPath: '', tagPrefix: 'plugin-{unit}', prospectiveTag: 'plugin-selected-v1.0.0-pre', selectedIds: 'selected', requestedKind: 'draft', publish: false }
}
it('uses caller-owned nested manifest paths without any device or family assumption', () => {
  const root = mkdtempSync(join(tmpdir(), 'custom-consumer-'))
  fixtureFile(root, 'devices/other/model/unit.json', JSON.stringify({ name: 'selected', version: '1.0.0-pre' }))
  const event = { ...dispatch(), manifestPath: 'devices/other/model/unit.json', tagPrefix: 'custom-device', prospectiveTag: 'custom-device-v1.0.0-pre' }
  expect(consumerContext(event, root)).toMatchObject({ selectedIds: ['selected'], tag: event.prospectiveTag })
  expect(() => consumerContext({ ...event, manifestPath: '../outside.json' }, root)).toThrow('inside the source checkout')
})
it('discovers a unit by manifest identity when its directory has a different name', () => {
  const root = mkdtempSync(join(tmpdir(), 'custom-plugin-'))
  fixtureFile(root, 'arbitrary-directory/manifest.json', JSON.stringify({ name: 'selected', version: '1.0.0-pre' }))
  expect(consumerContext(dispatch(), root).selectedIds).toEqual(['selected'])
  const push = { ...dispatch(), eventName: 'push', refType: 'tag', refName: 'plugin-selected-v1.0.0-pre', selectedIds: '', requestedKind: 'prerelease' }
  expect(consumerContext(push, root)).toMatchObject({ selectedIds: ['selected'], releaseKind: 'prerelease', preparedOnly: true })
})

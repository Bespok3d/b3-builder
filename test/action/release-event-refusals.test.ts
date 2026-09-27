// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { consumerCheckout, contextCli, eventEnvironment, git, mockGithub } from './release-event-fixtures.js'
import type { EventValues } from './release-event-fixtures.js'
import { tagReceiptMessage } from '../../src/action/prepared-receipt.js'
import type { PreparedReceipt } from '../../src/action/prepared-receipt.js'

it.each([
  { 'expected-source-sha': '' }, { 'expected-source-sha': 'f'.repeat(40) },
  { 'selected-ids': '' }, { 'selected-ids': 'unrelated' }, { 'prospective-tag': 'daemon-v0.0.0' },
  { 'release-kind': 'live' }, { publish: true },
])('branch dispatch refuses inconsistent preparation or publication inputs: %j', (changed) => {
  const fixture = consumerCheckout('daemon')
  const values: EventValues = { inputs: { 'prospective-tag': fixture.tag, 'selected-ids': fixture.name, 'expected-source-sha': fixture.commit, 'release-kind': 'draft', publish: false, ...changed }, github: { event_name: 'workflow_dispatch', ref_type: 'branch', ref_name: 'candidate', repository: 'fixture/consumer' }, steps: {} }
  expect(() => contextCli(fixture.root, 'plan', eventEnvironment('daemon', fixture, values))).toThrow()
  expect(existsSync(join(fixture.root, '.b3-release-context.json'))).toBe(false)
  expect(existsSync(join(fixture.root, 'dist'))).toBe(false)
})
it('normal push refuses lightweight tags and annotations without a receipt before any artifact lookup', () => {
  const fixture = consumerCheckout('daemon')
  const values: EventValues = { inputs: {}, github: { event_name: 'push', ref_type: 'tag', ref_name: fixture.tag, repository: 'fixture/consumer' }, steps: {} }
  const github = mockGithub({})
  const env = eventEnvironment('daemon', fixture, values, github)
  git(fixture.root, ['tag', fixture.tag])
  expect(() => contextCli(fixture.root, 'plan', env)).toThrow('must be annotated')
  git(fixture.root, ['tag', '-d', fixture.tag])
  git(fixture.root, ['tag', '-a', fixture.tag, '-m', 'not a preparation receipt'])
  expect(() => contextCli(fixture.root, 'plan', env)).toThrow('no prepared release receipt')
  expect(existsSync(join(github, 'calls'))).toBe(false)
})
it('normal push refuses an unavailable exact artifact without selecting a newer build or rebuilding', () => {
  const fixture = consumerCheckout('daemon')
  const values: EventValues = { inputs: {}, github: { event_name: 'push', ref_type: 'tag', ref_name: fixture.tag, repository: 'fixture/consumer' }, steps: {} }
  const github = mockGithub({})
  const env = eventEnvironment('daemon', fixture, values, github)
  const receipt: PreparedReceipt = { schema: 1, repository: 'fixture/consumer', sourceCommit: fixture.commit, tag: fixture.tag, selectedIds: [fixture.name], releaseKind: 'draft', builderCommit: env.B3D_BUILDER_COMMIT!, registerCommit: env.B3D_REGISTER_COMMIT!, runId: 101, runAttempt: 1, artifactId: 501, artifactDigest: `sha256:${'a'.repeat(64)}`, archiveSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64) }
  writeFileSync(join(fixture.root, 'tag-message'), tagReceiptMessage(receipt))
  git(fixture.root, ['tag', '-a', fixture.tag, '-F', 'tag-message'])
  writeFileSync(join(github, 'responses.json'), JSON.stringify({ 'repos/fixture/consumer/actions/runs/101/attempts/1': { id: 101, run_attempt: 1, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success', head_sha: fixture.commit, repository: { id: 7, full_name: receipt.repository }, head_repository: { id: 7, full_name: receipt.repository } } }))
  expect(() => contextCli(fixture.root, 'plan', env)).toThrow()
  expect(readFileSync(join(github, 'calls'), 'utf8').trim().split('\n')).toEqual(['repos/fixture/consumer/actions/runs/101/attempts/1', 'repos/fixture/consumer/actions/artifacts/501'])
  expect(existsSync(join(fixture.root, 'dist'))).toBe(false)
})

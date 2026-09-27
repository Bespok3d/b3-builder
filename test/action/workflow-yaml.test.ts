// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { expect, it } from 'vitest'
import { consumerSource } from './consumer-source.js'

it('parses the complete composite Action and propagates every declared release input', () => {
  const document = parseDocument(readFileSync(resolve(import.meta.dirname, '../../action.yml'), 'utf8'))
  expect(document.errors).toEqual([])
  const action = document.toJS() as { inputs: Record<string, unknown>; runs: { steps: { uses?: string; with?: Record<string, string>; run?: string; env?: Record<string, string> }[] } }
  expect(action.runs.steps[0]!.with).toEqual({ 'node-version': '${{ inputs.node-version }}' })
  action.runs.steps.filter((step) => step.run?.includes('release-main.js')).forEach((step) => {
    expect(step.env!.B3D_RELEASE_KIND).toBe('${{ inputs.release-kind }}')
    expect(step.env!.B3D_SELECTED_IDS).toBe('${{ inputs.selected-ids }}')
    expect(step.env!.B3D_BUILDER_COMMIT).toBe('${{ github.action_ref }}')
  })
})
it.each(['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'])('%s parses and permits only the read access needed for prepared outputs', (repo) => {
  const document = parseDocument(consumerSource(`${repo}/.github/workflows/release.yml`).toString('utf8'))
  expect(document.errors).toEqual([])
  const workflow = document.toJS() as { jobs: Record<string, { permissions: Record<string, string> }> }
  expect(workflow.jobs['build-and-release']!.permissions.actions).toBe('read')
})

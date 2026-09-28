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
  action.runs.steps.filter((step) => /release-main\.js" (prepare|publish)/.test(step.run ?? '')).forEach((step) => {
    expect(step.env!.B3D_RELEASE_KIND).toBe('${{ steps.context.outputs.release-kind || steps.selection.outputs.release-kind }}')
    expect(step.env!.B3D_SELECTED_IDS).toBe('${{ steps.context.outputs.selected-ids || steps.selection.outputs.selected-ids }}')
    expect(step.env!.B3D_BUILDER_COMMIT).toBe('${{ github.action_ref }}')
  })
  expect(action.runs.steps.find((step) => step.run?.includes('release-main.js" preview'))).toMatchObject({
    env: { B3D_BAKE: '${{ inputs.bake }}' },
  })
  expect(action.runs.steps.find((step) => step.uses === 'actions/download-artifact@v4')?.with?.['artifact-ids']).toBe('${{ steps.context.outputs.prepared-artifact-id }}')
  expect(action.runs.steps.find((step) => step.uses === 'actions/upload-artifact@v4' && step.with?.name === 'verified-unit-receipt')).toBeDefined()
})
it.each(['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'])('%s parses and permits only the read access needed for prepared outputs', (repo) => {
  const document = parseDocument(consumerSource(`${repo}/.github/workflows/release.yml`).toString('utf8'))
  expect(document.errors).toEqual([])
  const workflow = document.toJS() as { jobs: Record<string, { permissions: Record<string, string>; steps: { id?: string; with?: Record<string, string> }[] }> }
  const job = workflow.jobs['build-and-release']!
  expect(job.permissions.actions).toBe('read')
  expect(job.steps.find((step) => step.id === 'release')!.with).toMatchObject({ 'managed-release': 'true', 'require-signature': 'true' })
})

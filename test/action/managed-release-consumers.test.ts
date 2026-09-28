// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { expect, it } from 'vitest'

const publishers = [
  'all-the-tags', 'fluidd-plugin', 'fluidd-timelapse', 'mainsail-plugin', 'moonraker-auth',
  'octoeverywhere-plugin', 'panda-breath-plugin', 'reference-python-plugins', 'u1-afc-lite',
  'u1-base', 'u1-camera-configs', 'u1-enhanced-rfid', 'u1-extras', 'u1-faulty-toolhead',
  'u1-force-macros', 'u1-hw-camera', 'u1-klipper-config-enhancers', 'u1-motion-tweaks', 'u1-remote-screen',
]

it.each(publishers)('%s prepares and publishes only the selected release via the shared Action', (publisher) => {
  const path = resolve(import.meta.dirname, `../../../plugins/${publisher}/.github/workflows/release.yml`)
  const document = parseDocument(readFileSync(path, 'utf8'))
  expect(document.errors).toEqual([])
  const workflow = document.toJS() as { jobs: Record<string, { permissions: Record<string, string>; steps: { id?: string; uses?: string; if?: string; with?: Record<string, string> }[] }> }
  const job = workflow.jobs['build-and-release']!
  expect(job.permissions.actions).toBe('read')
  const action = job.steps.find((step) => step.uses?.startsWith('Bespok3d/b3-builder@'))!
  expect(action.with).toMatchObject({ 'managed-release': 'true', 'release-tag': '${{ inputs.prospective-tag }}', 'expected-source-sha': '${{ inputs.expected-source-sha }}', 'prepared-receipt': '${{ inputs.prepared-receipt }}', 'require-signature': 'true' })
  expect(action.with?.publish).toBe("${{ github.event_name == 'push' || inputs.publish }}")
  const registration = job.steps.find((step) => step.uses?.includes('register-atoms@'))
  if (!registration) return
  expect(action.id).toBe('release')
  expect(registration.if).toBe("${{ steps.release.outputs.publish == 'true' }}")
  expect(registration.with).toMatchObject({ 'selected-ids': '${{ steps.release.outputs.selected-ids }}', 'release-kind': '${{ steps.release.outputs.release-kind }}' })
})

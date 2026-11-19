// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { expect, it } from 'vitest'

const publishers = [
  'all-the-tags', 'fluidd-plugin', 'fluidd-timelapse', 'mainsail-plugin', 'moonraker-auth',
  'octoeverywhere-plugin', 'panda-breath-plugin', 'reference-python-plugins', 'u1-afc-lite',
  'u1-base', 'u1-camera-configs', 'u1-enhanced-rfid', 'u1-extras', 'u1-faulty-toolhead',
  'u1-force-macros', 'u1-hw-camera', 'u1-klipper-config-enhancers', 'u1-motion-tweaks', 'u1-remote-screen',
]

// The Action registers a list publisher's sub-list into the index-of-lists on a live release only (a repo
// unit with a list-name and a main-index-token, as in action.yml), so such a repo registers its atoms
// for a draft or prerelease and leaves live to its list. Any other repo reaches the index through its
// atoms alone and registers them for every kind.
const ATOM_REGISTRATION_ON_PUBLISH = "${{ steps.release.outputs.publish == 'true' }}"
const ATOM_REGISTRATION_BEFORE_LIVE = "${{ steps.release.outputs.publish == 'true' && steps.release.outputs.release-kind != 'live' }}"

function registersSubListOnLive(builderInputs: Record<string, string> | undefined): boolean {
  return builderInputs?.unit === 'repo' && Boolean(builderInputs['list-name']) && Boolean(builderInputs['main-index-token'])
}

function expectedAtomRegistration(builderInputs: Record<string, string> | undefined): string {
  if (registersSubListOnLive(builderInputs)) return ATOM_REGISTRATION_BEFORE_LIVE
  return ATOM_REGISTRATION_ON_PUBLISH
}

it.each(publishers)('%s prepares and publishes only the selected release via the shared Action', (publisher) => {
  const workspace = process.env.B3D_CONSUMER_WORKSPACE ?? resolve(import.meta.dirname, '../../..')
  const path = resolve(workspace, `plugins/${publisher}/.github/workflows/release.yml`)
  expect(existsSync(path)).toBe(true)
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
  expect(registration.if).toBe(expectedAtomRegistration(action.with))
  expect(registration.with).toMatchObject({ 'selected-ids': '${{ steps.release.outputs.selected-ids }}', 'release-kind': '${{ steps.release.outputs.release-kind }}' })
})

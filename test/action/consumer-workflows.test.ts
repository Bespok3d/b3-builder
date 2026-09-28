// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { consumerSource } from './consumer-source.js'
import { expect, it } from 'vitest'

it.each(['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'])('%s delegates receipt and exact prepared publication to the builder', (repo) => {
  const workflow = consumerSource(`${repo}/.github/workflows/release.yml`).toString('utf8')
  expect(workflow).toContain("managed-release: 'true'")
  expect(workflow).toContain('release-tag: ${{ inputs.prospective-tag }}')
  expect(workflow).toContain('selected-ids: ${{ inputs.selected-ids }}')
  expect(workflow).toContain('prepared-receipt: ${{ inputs.prepared-receipt }}')
  expect(workflow).toContain("require-signature: 'true'")
  expect(workflow).toContain('atoms-dir: dist/registration')
  expect(workflow).toContain("steps.release.outputs.publish == 'true'")
  expect(workflow).not.toContain('verified-unit-outputs.tar.gz')
  expect(workflow).not.toContain('--clobber')
})

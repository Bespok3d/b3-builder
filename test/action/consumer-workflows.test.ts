// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { consumerSource } from './consumer-source.js'
import { expect, it } from 'vitest'

it.each(['daemon', 'adapters', 'plugins/networking', 'plugins/spoolman-klipper-helper'])('%s consumer propagates selection/tier and reuses exact prepared outputs', (repo) => {
  const workflow = consumerSource(`${repo}/.github/workflows/release.yml`).toString('utf8')
  expect(workflow).toContain('release-kind: ${{ steps.release-selection.outputs.release-kind }}')
  expect(workflow).toContain('selected-ids: ${{ steps.release-selection.outputs.selected-ids }}')
  expect(workflow).toContain('prepared-only: ${{ steps.release-selection.outputs.prepared-only }}')
  expect(workflow).toContain("require-signature: 'true'")
  expect(workflow).toContain('atoms-dir: dist/registration')
  expect(workflow).toMatch(/register-commit: [0-9a-f]{40}/)
  expect(workflow).toContain('tar -czf verified-unit-outputs.tar.gz dist')
  expect(workflow).toContain('release-context-main.js" restore')
  expect(workflow).toContain('artifact-ids: ${{ steps.release-selection.outputs.prepared-artifact-id }}')
  expect(workflow).toContain('expected-source-sha: ${{ inputs.expected-source-sha }}')
  expect(workflow).not.toContain('--clobber')
})

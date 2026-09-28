// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { actionRequest } from '../../src/action/release-inputs.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const compositeAction = readFileSync(join(repoRoot, 'action.yml'), 'utf8')

describe('single-root-plugin Action release path', () => {
  it('passes root-plugin identity and selection into the same verified publisher as repo builds', () => {
    const request = actionRequest({ B3D_SOURCE: '.', B3D_OUT: 'dist', B3D_UNIT: 'plugin', B3D_ATOM_REPO: 'publisher/repo', B3D_SELECTED_IDS: 'root-plugin', B3D_RELEASE_KIND: 'draft' })
    expect(request).toMatchObject({ unit: 'plugin', identity: { atomRepo: 'publisher/repo' }, selectedIds: ['root-plugin'], releaseKind: 'draft' })
    expect(compositeAction).toContain('test_dirs=("${B3D_SOURCE%/}/")')
    expect(compositeAction).toContain('test_dirs=("$B3D_SOURCE"/*/)')
  })
  it('builds only when outputs were not prepared and verifies before publication', () => {
    expect(compositeAction).toContain("if: ${{ inputs.prepared-only != 'true' }}")
    expect(compositeAction).toContain('dist/action/release-main.js" prepare')
    expect(compositeAction).toContain('dist/action/release-main.js" publish')
    expect(compositeAction).not.toContain('--clobber')
  })
  it('keeps Live sub-list registration out of plugin units and candidate releases', () => {
    expect(compositeAction).toContain("inputs.unit == 'repo' && inputs.main-index-token != '' && inputs.list-name != ''")
  })
})

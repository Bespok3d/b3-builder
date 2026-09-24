// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const compositeAction = readFileSync(join(repoRoot, 'action.yml'), 'utf8')

describe('single-root-plugin Action release path', () => {
  it('selects the root plugin while retaining repo-unit directory iteration', () => {
    expect(compositeAction).toContain('B3D_UNIT: ${{ inputs.unit }}')
    expect(compositeAction).toContain('test_dirs=("${B3D_SOURCE%/}/")')
    expect(compositeAction).toContain('test_dirs=("$B3D_SOURCE"/*/)')
    expect(compositeAction).toContain('release_dirs=("${B3D_SOURCE%/}/")')
    expect(compositeAction).toContain('release_dirs=("$B3D_SOURCE"/*/)')
  })

  it('releases the signed root package and its declared document assets', () => {
    expect(compositeAction).toContain('B3D_SIGNING_KEY: ${{ inputs.signing-key }}')
    expect(compositeAction).toContain('gh release upload "$tag" "$B3D_OUT/$asset" --clobber')
    expect(compositeAction).toContain('for doc_asset in "${changelog_source}:CHANGELOG.md" "doc/README.md:README.md"; do')
    expect(compositeAction).toContain('cp "${dir}${doc_source}" "$B3D_OUT/${name}-${version}-${doc_name}"')
  })

  it('finalizes root atoms but keeps assembled-list finalization repo-only', () => {
    expect(compositeAction).toMatch(/name: Finalize atom download[\s\S]*?if: \$\{\{ inputs\.publish == 'true' \}\}/)
    expect(compositeAction).toContain("if: ${{ inputs.unit == 'repo' && inputs.list-name != '' && inputs.publish == 'true' }}")
  })

  it('keeps registration and list assets out of the plugin unit', () => {
    expect(compositeAction).toMatch(/if: \$\{\{ inputs\.unit == 'repo' && inputs\.list-name != '' && inputs\.publish == 'true' \}\}/)
    expect(compositeAction).toMatch(/if: \$\{\{ inputs\.unit == 'repo' && inputs\.main-index-token != '' && inputs\.list-name != '' && inputs\.publish == 'true' \}\}/)
  })
})

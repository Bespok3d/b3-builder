// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A repo unit's list ships the way its .b3 files ship, as an asset of the same release, so a release
// writes nothing back into the plugin repo. Two orderings in this step are load bearing and neither is
// visible from a passing build: uploading before the download-url injection publishes a signature over
// bytes nobody is served, which reads to a client as tampering rather than as a stale list; and a repo
// has no release of its own, so a list uploaded to one release of a multi-plugin repo is invisible the
// moment another plugin in that repo releases next.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const compositeAction = readFileSync(join(repoRoot, 'action.yml'), 'utf-8')

describe('publishing the assembled list as a release asset', () => {
  it('uploads the list only after the injection step rewrote and signed it', () => {
    const injected = compositeAction.indexOf('dist/action/inject-release-urls.js')
    const uploaded = compositeAction.indexOf('gh release upload "$tag" "${artifacts[@]}"')
    expect(injected).toBeGreaterThan(-1)
    expect(uploaded).toBeGreaterThan(injected)
  })

  it('uploads the signed bytes the injection wrote, not the pre-injection build output', () => {
    expect(compositeAction).toContain('artifacts=("$B3D_SOURCE/index.json")')
    expect(compositeAction).toContain('artifacts+=("$B3D_SOURCE/index.json.sig")')
  })

  it('puts the list on every release the run touched, because a repo has no release of its own', () => {
    expect(compositeAction).toMatch(/echo "\$tag" >> "\$release_tags"/)
    expect(compositeAction).toMatch(/done < "\$B3D_RELEASE_TAGS"/)
  })

  it('drops a previous run signature when this build published none, and fails loudly if that delete fails', () => {
    expect(compositeAction).toMatch(/gh release delete-asset "\$tag" index\.json\.sig --yes\n/)
    expect(compositeAction).not.toMatch(/delete-asset[^\n]*\|\| true/)
  })

  it('refuses to register a list address no release backs, instead of publishing nothing quietly', () => {
    expect(compositeAction).toMatch(/\[ -s "\$B3D_RELEASE_TAGS" \] \|\| \{[^\n]*exit 1; \}/)
  })

  it('commits nothing into the plugin repo: no step enters its tree at all', () => {
    expect(compositeAction).not.toContain('cd "$B3D_SOURCE"')
    expect(compositeAction).not.toContain('assemble sub-list index.json')
  })

  it('registers a list address that survives the next release', () => {
    expect(compositeAction).toContain('list_url="https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/index.json"')
  })
})

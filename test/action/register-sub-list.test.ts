// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A repo unit's release registers its sub-list in the caller's index-of-lists. Cloning that index with
// no branch lands the entry on the index repo's default branch, which is not the branch the index is
// assembled and served from, so the store never sees the plugins the release just published.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const compositeAction = readFileSync(join(repoRoot, 'action.yml'), 'utf-8')

describe('the sub-list registration step', () => {
  it('clones the index branch the store reads, not the default branch', () => {
    expect(compositeAction).toMatch(/git clone --branch main "https:\/\/x-access-token:/)
  })

  it('rebases a rejected push onto the branch it checked out', () => {
    expect(compositeAction).toMatch(/git pull --rebase --no-edit origin main/)
  })

  // The registered reference names the repo and the asset, and nothing that a release mints fresh. A
  // per-release asset id would have to be re-registered on every publish, and a reader resolving the
  // asset by name off the latest release - which is how a private repo is read at all - would have
  // nothing to match on.
  it('registers the repo and the asset name, never a per-release id', () => {
    expect(compositeAction).toMatch(/list_url="https:\/\/github\.com\/\$\{GITHUB_REPOSITORY\}\/releases\/latest\/download\/index\.json"/)
  })
})

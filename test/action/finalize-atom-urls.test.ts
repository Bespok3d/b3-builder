// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { finalizeAtomUrls } from '../../src/action/finalize-atom-urls.js'

// An atoms-only repo publishes its per-plugin atoms directly, with no sub-list to carry the real URLs,
// so the Action finalizes each atom file in place from the same { filename: assetUrl } map the release
// step collects. An atom whose .b3 never reached a release would publish a bare filename, so it throws.
describe('finalizeAtomUrls', () => {
  function writeAtom(dir: string, name: string, downloadUrl: string): void {
    writeFileSync(join(dir, `${name}.atom.json`), JSON.stringify({ name, version: '0.1.0', download_url: downloadUrl }))
  }

  it('swaps every atom download_url in place and leaves other fields alone', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'b3-atom-finalize-'))
    writeAtom(outDir, 'tailscale', 'tailscale-0.1.0.b3')
    writeAtom(outDir, 'zerotier', 'zerotier-0.1.0.b3')
    const finalized = finalizeAtomUrls(outDir, {
      'tailscale-0.1.0.b3': 'https://api.github.com/repos/x/y/releases/assets/1',
      'zerotier-0.1.0.b3': 'https://api.github.com/repos/x/y/releases/assets/2',
    })
    expect(finalized.sort()).toEqual(['tailscale.atom.json', 'zerotier.atom.json'])
    const tailscale = JSON.parse(readFileSync(join(outDir, 'tailscale.atom.json'), 'utf8')) as {
      download_url: string
      version: string
    }
    expect(tailscale.download_url).toBe('https://api.github.com/repos/x/y/releases/assets/1')
    expect(tailscale.version).toBe('0.1.0')
  })

  it('leaves a collection atom alone: it ships no payload, so it has no download_url to finalize', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'b3-atom-finalize-'))
    writeAtom(outDir, 'tailscale', 'tailscale-0.1.0.b3')
    writeFileSync(
      join(outDir, 'all-the-tags.atom.json'),
      JSON.stringify({ name: 'all-the-tags', version: '0.1.0', kind: 'collection', members: [] }),
    )
    const finalized = finalizeAtomUrls(outDir, { 'tailscale-0.1.0.b3': 'https://api.github.com/repos/x/y/releases/assets/1' })
    expect(finalized).toEqual(['tailscale.atom.json'])
    const collection = JSON.parse(readFileSync(join(outDir, 'all-the-tags.atom.json'), 'utf8')) as { kind: string }
    expect(collection.kind).toBe('collection')
  })

  it('points an atom at the notes released with the version it offers', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'b3-atom-finalize-'))
    writeFileSync(
      join(outDir, 'tailscale.atom.json'),
      JSON.stringify({
        name: 'tailscale',
        version: '0.1.0',
        download_url: 'tailscale-0.1.0.b3',
        changelog_url: 'tailscale/doc/CHANGELOG.md',
        doc_url: 'https://github.com/org/repo/blob/main/tailscale/doc/README.md',
      }),
    )
    finalizeAtomUrls(outDir, {
      'tailscale-0.1.0.b3': 'https://api.github.com/repos/x/y/releases/assets/1',
      'tailscale-0.1.0-CHANGELOG.md': 'https://api.github.com/repos/x/y/releases/assets/2',
      'tailscale-0.1.0-README.md': 'https://api.github.com/repos/x/y/releases/assets/3',
    })
    const tailscale = JSON.parse(readFileSync(join(outDir, 'tailscale.atom.json'), 'utf8')) as {
      changelog_url: string
      doc_url: string
    }
    expect(tailscale.changelog_url).toBe('https://api.github.com/repos/x/y/releases/assets/2')
    expect(tailscale.doc_url).toBe('https://api.github.com/repos/x/y/releases/assets/3')
  })

  it('refuses an atom whose .b3 was never released', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'b3-atom-finalize-'))
    writeAtom(outDir, 'tailscale', 'tailscale-0.1.0.b3')
    expect(() => finalizeAtomUrls(outDir, {})).toThrow(/tailscale-0.1.0.b3/)
  })
})

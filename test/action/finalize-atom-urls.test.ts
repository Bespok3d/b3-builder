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

  it('refuses an atom whose .b3 was never released', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'b3-atom-finalize-'))
    writeAtom(outDir, 'tailscale', 'tailscale-0.1.0.b3')
    expect(() => finalizeAtomUrls(outDir, {})).toThrow(/tailscale-0.1.0.b3/)
  })
})

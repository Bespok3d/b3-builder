import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeDownload, extractArchive, fetchToFile, verifySha256 } from '../../src/core/bake/download.js'
import { sha256OfFile } from '../../src/core/build/file-tree.js'
import { spawnRunner } from '../../src/core/bake/runner.js'
import type { DownloadBake } from '../../src/core/bake/manifest-bake.js'
import { fakeRunner } from './fake-runner.js'

// Build an obviously-fake gzip tarball carrying one member, and return its path + real sha256. tar and
// curl (with file://) are hard requirements of class 4 anyway, so the class-4 baker is exercised for
// REAL here (fetch + sha verify + extract + install), no network and no injected runner.
function fixtureTarball(): { url: string; sha256: string } {
  const content = mkdtempSync(join(tmpdir(), 'b3-dl-fixture-'))
  writeFileSync(join(content, 'demo-binary'), 'fake upstream binary\n')
  const tarball = join(content, 'demo.tgz')
  spawnSync('tar', ['-czf', tarball, '-C', content, 'demo-binary'])
  return { url: `file://${tarball}`, sha256: sha256OfFile(tarball) }
}

describe('bakeDownload (real fetch + verify + extract + install)', () => {
  it('fetches a sha-pinned archive, extracts the member, and installs it with its mode', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dl-plugin-'))
    writeStubInclude(pluginDir)
    const { url, sha256 } = fixtureTarball()
    const step: DownloadBake = {
      class: 'download',
      fetch: [{ url, sha256, archive: 'tar.gz', members: [{ path: 'demo-binary', dest: 'files/bin/demo-aarch64', mode: '0755' }] }],
      include: [{ src: 'src/demo-run', dest: 'files/bin/demo-run', mode: '0755' }],
    }

    bakeDownload(step, pluginDir, spawnRunner)

    const staged = join(pluginDir, 'files/bin/demo-aarch64')
    expect(readFileSync(staged, 'utf8')).toBe('fake upstream binary\n')
    expect(statSync(staged).mode & 0o777).toBe(0o755)
    expect(readFileSync(join(pluginDir, 'files/bin/demo-run'), 'utf8')).toBe('#!/bin/sh\n')
  })

  it('refuses an artifact whose sha256 does not match the pin', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dl-bad-'))
    const { url } = fixtureTarball()
    const step: DownloadBake = {
      class: 'download',
      fetch: [{ url, sha256: 'not-the-real-hash', archive: 'tar.gz', members: [{ path: 'demo-binary', dest: 'files/bin/x', mode: '0755' }] }],
      include: [],
    }
    expect(() => bakeDownload(step, pluginDir, spawnRunner)).toThrow(/sha256 mismatch/)
  })
})

function writeStubInclude(pluginDir: string): void {
  mkdirSync(join(pluginDir, 'src'), { recursive: true })
  writeFileSync(join(pluginDir, 'src/demo-run'), '#!/bin/sh\n')
}

// The archive shapes that need external tools not portable enough to run for real in the gate (ar for a
// .deb, xz) are covered by asserting the exact extraction commands against the legacy zerotier /
// system-utils shape.
describe('download command shapes', () => {
  it('curl fetches with -fsSL to the destination', () => {
    const { calls, runner } = fakeRunner()
    fetchToFile('https://example.invalid/x.deb', '/tmp/out', runner)
    expect(calls[0]).toEqual({ command: 'curl', args: ['-fsSL', 'https://example.invalid/x.deb', '-o', '/tmp/out'] })
  })

  it('a .deb extracts via ar then its data.tar.xz (no dpkg)', () => {
    const { calls, runner } = fakeRunner()
    extractArchive('deb', '/work/artifact-0', '/work', runner)
    expect(calls[0]).toEqual({ command: 'ar', args: ['x', '/work/artifact-0'], cwd: '/work' })
    expect(calls[1]).toMatchObject({ command: 'tar', args: ['-xf', join('/work', 'data.tar.xz'), '-C', '/work'] })
  })

  it('an xz tarball extracts with -xJf', () => {
    const { calls, runner } = fakeRunner()
    extractArchive('tar.xz', '/work/artifact-0', '/work', runner)
    expect(calls[0]).toEqual({ command: 'tar', args: ['-xJf', '/work/artifact-0', '-C', '/work'] })
  })

  it('verifySha256 accepts a matching hash', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'b3-sha-')), 'f')
    writeFileSync(file, 'abc')
    expect(() => verifySha256(file, sha256OfFile(file))).not.toThrow()
  })
})

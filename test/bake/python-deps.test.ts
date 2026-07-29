// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakePythonDeps } from '../../src/core/bake/python-deps.js'
import { argAfter, fakeRunner, nth, writeStub } from './fake-runner.js'

// Class 2 (ADR-0036): reproduces scripts/bake-deps.sh. The real pip download needs network, so the test
// injects a runner and asserts the exact aarch64 cross-download flags, the invariant a printer's
// interpreter depends on (the same flags daemon test_plugin_packaging pins): baking for the build
// runner's arch instead would ship a broken .b3.
function pluginWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'b3-py-'))
  Object.entries(files).forEach(([name, body]) => writeFileSync(join(dir, name), body))
  return dir
}

const ARM64_FLAGS = [
  '--only-binary=:all:',
  '--platform', 'manylinux2014_aarch64',
  '--python-version', '3.11',
  '--implementation', 'cp',
  '--abi', 'cp311', '--abi', 'abi3', '--abi', 'none',
]

describe('bakePythonDeps', () => {
  it('a plugin with no requirements bakes nothing', () => {
    const { calls, runner } = fakeRunner()
    bakePythonDeps(pluginWith({}), runner)
    expect(calls).toEqual([])
  })

  it('requirements.txt downloads printer-platform wheels into files/wheels', () => {
    const dir = pluginWith({ 'requirements.txt': 'humanize\n' })
    const { calls, runner } = fakeRunner()
    bakePythonDeps(dir, runner)
    expect(calls).toHaveLength(1)
    const download = nth(calls, 0)
    expect(download.command).toBe('python3')
    expect(download.args.slice(0, 6)).toEqual(['-m', 'pip', 'download', '-r', join(dir, 'requirements.txt'), '-d'])
    expect(argAfter(download, '-d')).toBe(join(dir, 'files', 'wheels'))
    expect(download.args).toEqual(expect.arrayContaining(ARM64_FLAGS))
  })

  it('re-baking clears a stale wheel so only the current requirement resolution is packed', () => {
    const dir = pluginWith({ 'requirements.txt': 'humanize>=4.9.0\n' })
    writeStub(join(dir, 'files', 'wheels', 'humanize-4.15.0-py3-none-any.whl'))
    const { runner } = fakeRunner((spec) => {
      if (spec.args.includes('download')) writeStub(join(argAfter(spec, '-d'), 'humanize-4.16.0-py3-none-any.whl'))
      return undefined
    })
    bakePythonDeps(dir, runner)
    expect(readdirSync(join(dir, 'files', 'wheels'))).toEqual(['humanize-4.16.0-py3-none-any.whl'])
  })

  it('klipper_requirements.txt downloads then unpacks each wheel into files/site-packages', () => {
    const dir = pluginWith({ 'klipper_requirements.txt': 'humanize\n' })
    const { calls, runner } = fakeRunner((spec) => {
      if (spec.args.includes('download')) writeStub(join(argAfter(spec, '-d'), 'humanize-4.0-py3-none-any.whl'))
      return undefined
    })
    bakePythonDeps(dir, runner)
    const unzip = calls.find((call) => call.args.includes('zipfile'))
    expect(unzip?.args).toEqual(['-m', 'zipfile', '-e', expect.stringMatching(/humanize-4\.0.*\.whl$/), join(dir, 'files', 'site-packages')])
  })
})

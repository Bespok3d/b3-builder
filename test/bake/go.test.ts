import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeGo } from '../../src/core/bake/go.js'
import type { GoBake } from '../../src/core/bake/manifest-bake.js'
import { argAfter, fakeRunner, nth, writeStub } from './fake-runner.js'

// Class 3 (go): the baker reproduces prometheus-exporter/build.sh. The real go cross-compile needs a Go
// toolchain and network, so the test injects a runner: it asserts the exact clone / checkout / build
// commands (the ground truth is the legacy script) and simulates the build's output so the output path
// is staged.
const STEP: GoBake = {
  class: 'go',
  source: 'https://example.invalid/prometheus-klipper-exporter.git',
  commit: '9eacec280108a4da8156b47c01c2862219d86ecd',
  package: '.',
  output: 'files/bin/prometheus-klipper-exporter',
}

describe('bakeGo', () => {
  it('clones the pin and cross-compiles static arm64 into the declared output', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-go-plugin-'))
    const { calls, runner } = fakeRunner((spec) => {
      if (spec.command === 'go') writeStub(argAfter(spec, '-o'))
      return undefined
    })

    bakeGo(STEP, pluginDir, runner)

    expect(nth(calls, 0)).toMatchObject({ command: 'git', args: ['clone', '--quiet', STEP.source, expect.any(String)] })
    expect(nth(calls, 1)).toMatchObject({ command: 'git', args: ['-C', expect.any(String), 'checkout', '--quiet', STEP.commit] })
    const build = nth(calls, 2)
    expect(build.command).toBe('go')
    expect(build.env).toEqual({ GOOS: 'linux', GOARCH: 'arm64', CGO_ENABLED: '0' })
    expect(build.args).toEqual(['-C', expect.any(String), 'build', '-o', join(pluginDir, STEP.output), '.'])
    expect(existsSync(join(pluginDir, STEP.output))).toBe(true)
  })

  it('passes go an absolute -o even when the plugin dir is relative', () => {
    const pluginDirRelative = relative(process.cwd(), mkdtempSync(join(tmpdir(), 'b3-go-rel-')))
    const { calls, runner } = fakeRunner((spec) => {
      if (spec.command === 'go') writeStub(argAfter(spec, '-o'))
      return undefined
    })

    bakeGo(STEP, pluginDirRelative, runner)

    // A relative -o would resolve against `go -C <clone>` and strand the binary in the throwaway clone.
    expect(isAbsolute(argAfter(nth(calls, 2), '-o'))).toBe(true)
    expect(existsSync(resolve(pluginDirRelative, STEP.output))).toBe(true)
  })

  it('fails loudly when the build exits non-zero', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-go-fail-'))
    const { runner } = fakeRunner((spec) => (spec.command === 'go' ? { status: 2, stdout: '', stderr: 'compile error' } : undefined))
    expect(() => bakeGo(STEP, pluginDir, runner)).toThrow(/go build .* failed \(exit 2\)/)
  })
})

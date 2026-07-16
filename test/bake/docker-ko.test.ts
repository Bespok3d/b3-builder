import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeDockerKo } from '../../src/core/bake/docker-ko.js'
import type { DockerKoBake } from '../../src/core/bake/manifest-bake.js'
import { fakeRunner, writeStub } from './fake-runner.js'

// Class 6 (docker-ko): reproduces tun-module/toolchain/build.sh + tun-module/build.sh. A kernel module
// cross-build is a native x86 build (no --platform, the inverse of the camera's arm64-under-QEMU). The
// test injects a runner asserting the build, the vermagic modinfo, and the variant staging, and covers
// the honest-limit case: a vermagic mismatch is refused, and the bake NEVER claims the module works (the
// on-device exercise is packet 7).
const STEP: DockerKoBake = {
  class: 'docker-ko',
  dockerfile: 'toolchain/Dockerfile',
  context: 'toolchain',
  module: 'tun.ko',
  out: '/out',
  kernel: { release: '6.1.99', vermagic: '6.1.99 SMP preempt mod_unload aarch64' },
  variantDest: 'files/modules/tun-6.1.99.ko',
}

function moduleInfoRun(vermagic: string) {
  return (spec: { args: string[] }) => {
    if (spec.args.includes('modinfo')) return { status: 0, stdout: `${vermagic}\n`, stderr: '' }
    if (spec.args[0] === 'cp') writeStub(join(spec.args[2] ?? '', 'tun.ko'), 'ELF-ko')
    return undefined
  }
}

describe('bakeDockerKo', () => {
  it('cross-builds native (no --platform), asserts vermagic, and stages the ko as the kernel variant', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-ko-'))
    const { calls, runner } = fakeRunner(moduleInfoRun(STEP.kernel.vermagic))

    bakeDockerKo(STEP, pluginDir, runner)

    const build = calls.find((call) => call.args[0] === 'buildx')
    expect(build?.args).not.toContain('--platform')
    const modinfo = calls.find((call) => call.args.includes('modinfo'))
    expect(modinfo?.args).toEqual(['run', '--rm', '--entrypoint', 'modinfo', expect.any(String), '-F', 'vermagic', '/out/tun.ko'])
    expect(existsSync(join(pluginDir, 'files/modules/tun-6.1.99.ko'))).toBe(true)
  })

  it('refuses a .ko whose vermagic does not match the target kernel', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-ko-bad-'))
    const { runner } = fakeRunner(moduleInfoRun('6.1.99 SMP preempt mod_unload aarch64 drifted'))
    expect(() => bakeDockerKo(STEP, pluginDir, runner)).toThrow(/vermagic mismatch.*6\.1\.99 kernel accepts/)
  })

  it('tells the user to start Docker when the daemon is down', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-ko-nodock-'))
    const { runner } = fakeRunner((spec) => (spec.args[0] === 'info' ? { status: 1, stdout: '', stderr: 'Cannot connect' } : undefined))
    expect(() => bakeDockerKo(STEP, pluginDir, runner)).toThrow(/Docker is required for the docker-ko bake and is not running/)
  })
})

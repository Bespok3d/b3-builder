import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeDockerC } from '../../src/core/bake/docker-c.js'
import type { DockerCBake } from '../../src/core/bake/manifest-bake.js'
import { fakeRunner, writeStub } from './fake-runner.js'

// Class 5 (docker-c): reproduces u1-hw-camera/toolchain/build.sh. The real build is a multi-minute
// QEMU arm64 Docker build, so the test injects a runner: it asserts the preflight, the buildx build (arm64
// under QEMU), and the /out extraction, and simulates the container's output so the expected-artifact
// assertion and the staging run.
const STEP: DockerCBake = {
  class: 'docker-c',
  dockerfile: 'toolchain/Dockerfile',
  context: '.',
  platform: 'linux/arm64',
  out: '/out',
  dest: 'files/bin',
  expect: ['capture-v4l2-raw-mpp', 'stream-webrtc'],
}

function cpDest(args: string[]): string {
  return args[0] === 'cp' ? args[2] ?? '' : ''
}

describe('bakeDockerC', () => {
  it('preflights docker, builds arm64 via buildx, and stages the expected artifacts', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-'))
    const { calls, runner } = fakeRunner((spec) => {
      if (cpDest(spec.args) !== '') STEP.expect.forEach((name) => writeStub(join(cpDest(spec.args), name)))
      return undefined
    })

    bakeDockerC(STEP, pluginDir, runner)

    expect(calls[0]).toMatchObject({ command: 'docker', args: ['info'], capture: true })
    const build = calls.find((call) => call.args[0] === 'buildx')
    expect(build?.args).toEqual(
      expect.arrayContaining(['buildx', 'build', '--load', '--platform', 'linux/arm64', '-f', join(pluginDir, 'toolchain/Dockerfile'), pluginDir]),
    )
    expect(existsSync(join(pluginDir, 'files/bin/capture-v4l2-raw-mpp'))).toBe(true)
    expect(existsSync(join(pluginDir, 'files/bin/stream-webrtc'))).toBe(true)
  })

  it('fails when the build produced a missing expected artifact', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-miss-'))
    const { runner } = fakeRunner((spec) => {
      if (cpDest(spec.args) !== '') writeStub(join(cpDest(spec.args), 'capture-v4l2-raw-mpp'))
      return undefined
    })
    expect(() => bakeDockerC(STEP, pluginDir, runner)).toThrow(/produced no stream-webrtc/)
  })

  it('tells the user to start Docker when the daemon is down (not the raw socket error)', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-nodock-'))
    const { runner } = fakeRunner((spec) =>
      spec.args[0] === 'info' ? { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' } : undefined,
    )
    expect(() => bakeDockerC(STEP, pluginDir, runner)).toThrow(/Docker is required for the docker-c bake and is not running\. Please start Docker/)
  })
})

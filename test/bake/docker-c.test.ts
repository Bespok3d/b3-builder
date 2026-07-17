import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeDockerC } from '../../src/core/bake/docker-c.js'
import type { DockerCBake } from '../../src/core/bake/manifest-bake.js'
import { fakeRunner, writeStub } from './fake-runner.js'

// Class 5 (docker-c): reproduces u1-hw-camera/toolchain/build.sh. The real build is a multi-minute
// QEMU arm64 Docker build, so the test injects a runner: it asserts the preflight, the buildx build (arm64
// under QEMU), and the /out extraction, and simulates the container's output so the member assertion and
// the staging run.
const STEP: DockerCBake = {
  class: 'docker-c',
  dockerfile: 'toolchain/Dockerfile',
  context: '.',
  platform: 'linux/arm64',
  out: '/out',
  members: [
    { path: 'capture-v4l2-raw-mpp', dest: 'files/bin/capture-v4l2-raw-mpp', mode: '0755' },
    { path: 'stream-webrtc', dest: 'files/bin/stream-webrtc', mode: '0755' },
  ],
}

function cpDest(args: string[]): string {
  return args[0] === 'cp' ? args[2] ?? '' : ''
}

// Simulate what the image's /out held, at the destination `docker cp` extracts it to.
function producing(names: string[]): ReturnType<typeof fakeRunner> {
  return fakeRunner((spec) => {
    if (cpDest(spec.args) !== '') names.forEach((name) => writeStub(join(cpDest(spec.args), name)))
    return undefined
  })
}

describe('bakeDockerC', () => {
  it('preflights docker, builds arm64 via buildx, and stages the declared members', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-'))
    const { calls, runner } = producing(['capture-v4l2-raw-mpp', 'stream-webrtc'])

    bakeDockerC(STEP, pluginDir, runner)

    expect(calls[0]).toMatchObject({ command: 'docker', args: ['info'], capture: true })
    const build = calls.find((call) => call.args[0] === 'buildx')
    expect(build?.args).toEqual(
      expect.arrayContaining(['buildx', 'build', '--load', '--platform', 'linux/arm64', '-f', join(pluginDir, 'toolchain/Dockerfile'), pluginDir]),
    )
    expect(existsSync(join(pluginDir, 'files/bin/capture-v4l2-raw-mpp'))).toBe(true)
    expect(existsSync(join(pluginDir, 'files/bin/stream-webrtc'))).toBe(true)
  })

  it('fails when the build produced no member the manifest declared', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-miss-'))
    const { runner } = producing(['capture-v4l2-raw-mpp'])
    expect(() => bakeDockerC(STEP, pluginDir, runner)).toThrow(/produced no stream-webrtc/)
  })

  // The hole this class shipped with: it staged the whole out dir, so an html/ tree the Dockerfile left
  // behind reached a printer as payload nobody declared. An undeclared extra now fails the bake.
  it('fails when the build left an undeclared extra in the out dir, rather than staging it', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-extra-'))
    const { runner } = producing(['capture-v4l2-raw-mpp', 'stream-webrtc', 'leftover-debug-symbols'])
    expect(() => bakeDockerC(STEP, pluginDir, runner)).toThrow(/left leftover-debug-symbols in \/out with no matching member/)
    expect(existsSync(join(pluginDir, 'files/bin/leftover-debug-symbols'))).toBe(false)
  })

  // A member reaching into a subdirectory is checked on its FULL path, not just the top-level dir it
  // roots at: a build that creates the dir but not the file inside it must say what it failed to produce
  // instead of dying on a raw ENOENT while staging.
  it('fails on the declared path when the build produced the member dir but not the member', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-nested-'))
    const nestedStep: DockerCBake = { ...STEP, members: [{ path: 'lib/libv4l2-imposter.so', dest: 'files/bin/libv4l2-imposter.so', mode: '0755' }] }
    const { runner } = fakeRunner((spec) => {
      if (cpDest(spec.args) !== '') mkdirSync(join(cpDest(spec.args), 'lib'), { recursive: true })
      return undefined
    })
    expect(() => bakeDockerC(nestedStep, pluginDir, runner)).toThrow(/produced no lib\/libv4l2-imposter\.so/)
  })

  it('tells the user to start Docker when the daemon is down (not the raw socket error)', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'b3-dc-nodock-'))
    const { runner } = fakeRunner((spec) =>
      spec.args[0] === 'info' ? { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' } : undefined,
    )
    expect(() => bakeDockerC(STEP, pluginDir, runner)).toThrow(/Docker is required for the docker-c bake and is not running\. Please start Docker/)
  })
})

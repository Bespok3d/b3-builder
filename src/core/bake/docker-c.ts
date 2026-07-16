import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner } from './runner.js'
import { buildImage, extractImageDir, imageTag, requireDocker } from './docker-image.js'
import { stageTree } from './stage.js'
import type { DockerCBake } from './manifest-bake.js'

// Class 5: cross-build a native C binary + .so from source inside Docker (arm64 under QEMU on an x86
// runner) and stage the built artifacts into files/. Reproduces u1-hw-camera/toolchain/build.sh: docker
// buildx build, extract the image's /out, assert every expected artifact is present, and copy them into
// the payload. The expected list is the build.sh's own validation loop, made declarative.
export function bakeDockerC(step: DockerCBake, pluginDir: string, runner: CommandRunner): void {
  requireDocker(runner, 'docker-c')
  const tag = imageTag(pluginDir, 'c')
  buildImage(tag, join(pluginDir, step.dockerfile), join(pluginDir, step.context), step.platform, runner)
  const extracted = mkdtempSync(join(tmpdir(), 'b3-docker-c-'))
  extractImageDir(tag, `${tag}-extract`, step.out, extracted, runner)
  assertExpected(step.expect, extracted)
  stageTree(extracted, join(pluginDir, step.dest))
}

function assertExpected(expect: string[], extracted: string): void {
  const missing = expect.filter((name) => !existsSync(join(extracted, name)))
  if (missing.length > 0) {
    throw new Error(`docker-c bake produced no ${missing.join(', ')} (check the Docker build output)`)
  }
}

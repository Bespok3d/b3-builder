import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner } from './runner.js'
import { runOrThrow } from './runner.js'
import { buildImage, extractImageDir, imageTag, requireDocker } from './docker-image.js'
import { stageFile } from './stage.js'
import type { DockerKoBake } from './manifest-bake.js'

// Class 6: cross-compile a kernel module inside Docker (a native x86 cross-build, no --platform, the
// inverse of the camera's arm64-under-QEMU) and stage it as the kernel variant the manifest declares.
// Reproduces tun-module/toolchain/build.sh + tun-module/build.sh: build, assert the module's vermagic
// matches the target kernel, extract, and copy it to the variant's declared src.
//
// The vermagic assertion is necessary but NOT sufficient (MODVERSIONS is off, so no symbol-CRC net; a
// wrong-commit .ko has matched vermagic, loaded cleanly, and still failed TUNSETIFF EINVAL, ADR-0039).
// So this bake asserts vermagic only; it never claims the module WORKS. The real gate is the on-device
// capability exercise, which is packet 7's job, never this step's.
export function bakeDockerKo(step: DockerKoBake, pluginDir: string, runner: CommandRunner): void {
  requireDocker(runner, 'docker-ko')
  const tag = imageTag(pluginDir, 'ko')
  buildImage(tag, join(pluginDir, step.dockerfile), join(pluginDir, step.context), undefined, runner)
  assertVermagic(step, tag, runner)
  const extracted = mkdtempSync(join(tmpdir(), 'b3-docker-ko-'))
  extractImageDir(tag, `${tag}-extract`, step.out, extracted, runner)
  const builtModule = join(extracted, step.module)
  if (!existsSync(builtModule)) throw new Error(`docker-ko bake produced no ${step.module} (check the Docker build output)`)
  stageFile(builtModule, join(pluginDir, step.variantDest), '0644')
}

function assertVermagic(step: DockerKoBake, tag: string, runner: CommandRunner): void {
  const moduleInImage = `${step.out}/${step.module}`
  const result = runOrThrow(
    runner,
    { command: 'docker', args: ['run', '--rm', '--entrypoint', 'modinfo', tag, '-F', 'vermagic', moduleInImage], capture: true },
    'modinfo vermagic',
  )
  const built = result.stdout.trim()
  if (built !== step.kernel.vermagic) {
    throw new Error(
      `vermagic mismatch: built "${built}", the ${step.kernel.release} kernel accepts "${step.kernel.vermagic}". ` +
        'The kernel source point or .config drifted; do NOT ship this .ko.',
    )
  }
}

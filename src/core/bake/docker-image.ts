// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { basename } from 'node:path'
import type { CommandRunner } from './runner.js'
import { runOrThrow } from './runner.js'

// Shared Docker plumbing for the two container-built classes (docker-c and docker-ko): the preflight,
// the buildx build, and the /out extraction, ported from the toolchain lib/docker-build.sh helpers.

// Fail early and clearly when Docker is needed but not running, so a human (or an LLM driving the tool)
// is told exactly what to start, not handed the raw `Cannot connect to the Docker daemon` socket error
// the legacy build.sh scripts surface. The same principle applies to any toolchain a baker needs.
export function requireDocker(runner: CommandRunner, bakeClass: string): void {
  const result = runner({ command: 'docker', args: ['info'], capture: true })
  if (result.status !== 0) {
    throw new Error(`Docker is required for the ${bakeClass} bake and is not running. Please start Docker and retry.`)
  }
}

// `docker buildx build --load` an image from an explicit Dockerfile + context. --load brings the result
// into the local image store so the extract (and, for a .ko, the vermagic check) can read from it. When
// CI sets B3D_CACHE_ARGS it splices the buildx layer-cache flags, matching docker-build.sh; unset
// locally, so a plain local build is unaffected. A docker-c bake passes --platform (arm64 under QEMU); a
// docker-ko bake passes none (a native cross-compile).
export function buildImage(
  tag: string,
  dockerfile: string,
  context: string,
  platform: string | undefined,
  runner: CommandRunner,
): void {
  const platformArgs = platform === undefined ? [] : ['--platform', platform]
  const args = ['buildx', 'build', '--load', ...cacheArgs(), ...platformArgs, '-t', tag, '-f', dockerfile, context]
  runOrThrow(runner, { command: 'docker', args }, `docker buildx build ${tag}`)
}

function cacheArgs(): string[] {
  const cache = process.env.B3D_CACHE_ARGS
  return cache === undefined || cache.trim() === '' ? [] : cache.trim().split(/\s+/)
}

// Copy the image's out dir (default /out) into a local dir, via a throwaway container, mirroring
// docker_extract.
export function extractImageDir(
  tag: string,
  containerName: string,
  imageOutDir: string,
  destDir: string,
  runner: CommandRunner,
): void {
  mkdirSync(destDir, { recursive: true })
  runOrThrow(runner, { command: 'docker', args: ['create', '--name', containerName, tag] }, `docker create ${tag}`)
  runOrThrow(runner, { command: 'docker', args: ['cp', `${containerName}:${imageOutDir}/.`, destDir] }, `docker cp ${tag}`)
  runOrThrow(runner, { command: 'docker', args: ['rm', containerName] }, `docker rm ${containerName}`)
}

// A docker-safe image tag derived from the plugin dir, stable within a build and unlikely to collide
// with an unrelated local image.
export function imageTag(pluginDir: string, suffix: string): string {
  const slug = basename(pluginDir).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `b3d-bake-${slug}-${suffix}`
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner } from './runner.js'
import { buildImage, extractImageDir, imageTag, requireDocker } from './docker-image.js'
import { stageMember } from './stage.js'
import type { DockerCBake, PayloadMember } from './manifest-bake.js'

// Class 5: cross-build a native C binary + .so from source inside Docker (arm64 under QEMU on an x86
// runner) and stage the built artifacts into files/. Reproduces u1-hw-camera/toolchain/build.sh: docker
// buildx build, extract the image's out dir, assert it holds EXACTLY the declared members, and stage each
// one. The declaration is exhaustive on purpose: staging the whole out dir shipped every leftover the
// Dockerfile happened to leave there (a stale html/ tree reached a printer that way) and a presence-only
// check never noticed. Same contract the download class carries via `members`.
export function bakeDockerC(step: DockerCBake, pluginDir: string, runner: CommandRunner): void {
  requireDocker(runner, 'docker-c')
  const tag = imageTag(pluginDir, 'c')
  buildImage(tag, join(pluginDir, step.dockerfile), join(pluginDir, step.context), step.platform, runner)
  const extracted = mkdtempSync(join(tmpdir(), 'b3-docker-c-'))
  extractImageDir(tag, `${tag}-extract`, step.out, extracted, runner)
  assertDeclaredExactly(step.members, extracted, step.out)
  step.members.forEach((member) => stageMember(member, extracted, pluginDir))
}

// A member path may reach into a subdirectory, so compare on the top-level entry each one roots at: that
// is the granularity the extracted dir lists, and it is what catches a whole undeclared tree appearing.
function topLevelEntryOf(memberPath: string): string {
  return memberPath.split('/')[0] ?? memberPath
}

function assertDeclaredExactly(members: PayloadMember[], extracted: string, imageOutDir: string): void {
  const missing = members.filter((member) => !existsSync(join(extracted, member.path)))
  if (missing.length > 0) {
    throw new Error(`docker-c bake produced no ${missing.map((member) => member.path).join(', ')} (check the Docker build output)`)
  }
  const declaredRoots = new Set(members.map((member) => topLevelEntryOf(member.path)))
  const undeclared = readdirSync(extracted).filter((entry) => !declaredRoots.has(entry))
  if (undeclared.length > 0) {
    throw new Error(`docker-c bake left ${undeclared.join(', ')} in ${imageOutDir} with no matching member: declare it or stop producing it`)
  }
}

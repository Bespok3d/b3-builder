// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { chmodSync, copyFileSync, cpSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PayloadMember } from './bake-types.js'

// Stage a produced file into the plugin payload at destAbs with an octal mode string (e.g. "0755"),
// creating its parent dir: the one place every baker installs an output file, so mode handling and
// parent creation are not re-hand-rolled per class. Mirrors the legacy `install -m <mode> <src> <dest>`.
export function stageFile(srcAbs: string, destAbs: string, mode: string): void {
  mkdirSync(dirname(destAbs), { recursive: true })
  copyFileSync(srcAbs, destAbs)
  chmodSync(destAbs, Number.parseInt(mode, 8))
}

// Copy a produced directory tree into the payload (the extracted image /out of a docker bake), merging
// into an existing dest.
export function stageTree(srcDir: string, destDir: string): void {
  cpSync(srcDir, destDir, { recursive: true })
}

// Install one declared member of a baker's produced tree (`producedRoot`) into the payload. A member is
// either a FILE (a binary installed with its declared mode: the zerotier / camera shape) or a DIRECTORY
// (a vendored app tree: octoeverywhere's `octoeverywhere/`, `linux_host/`). Mode is a file concept, so a
// tree keeps the modes it was produced with and the declared mode is not applied to it.
export function stageMember(member: PayloadMember, producedRoot: string, pluginDir: string): void {
  const memberSrc = join(producedRoot, member.path)
  const memberDest = join(pluginDir, member.dest)
  if (statSync(memberSrc).isDirectory()) return stageTree(memberSrc, memberDest)
  stageFile(memberSrc, memberDest, member.mode)
}

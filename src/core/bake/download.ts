// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner } from './runner.js'
import { runOrThrow } from './runner.js'
import { sha256OfFile } from '../build/file-tree.js'
import { stageFile, stageMember } from './stage.js'
import type { ArchiveKind, DownloadBake, DownloadFetch } from './manifest-bake.js'

// Class 4: fetch sha-pinned upstream binaries and stage them into files/, no compile. Reproduces the
// zerotier / tailscale / system-utils build.sh scripts: curl each pinned URL, verify its sha256, extract
// the archive, and install the named members with their mode. `include` copies the local launcher
// wrappers (zt-run / ts-run) that ship next to the upstream binary.
export function bakeDownload(step: DownloadBake, pluginDir: string, runner: CommandRunner): void {
  const work = mkdtempSync(join(tmpdir(), 'b3-dl-'))
  step.fetch.forEach((fetch, index) => processFetch(fetch, index, work, pluginDir, runner))
  step.include.forEach((include) => stageFile(join(pluginDir, include.src), join(pluginDir, include.dest), include.mode))
}

function processFetch(fetch: DownloadFetch, index: number, work: string, pluginDir: string, runner: CommandRunner): void {
  const archiveFile = join(work, `artifact-${index}`)
  fetchToFile(fetch.url, archiveFile, runner)
  verifySha256(archiveFile, fetch.sha256)
  extractArchive(fetch.archive, archiveFile, work, runner)
  fetch.members.forEach((member) => stageMember(member, work, pluginDir))
}

export function fetchToFile(url: string, dest: string, runner: CommandRunner): void {
  runOrThrow(runner, { command: 'curl', args: ['-fsSL', url, '-o', dest] }, `curl ${url}`)
}

export function verifySha256(file: string, expected: string): void {
  const actual = sha256OfFile(file)
  if (actual !== expected) throw new Error(`sha256 mismatch for downloaded artifact: expected ${expected}, got ${actual}`)
}

export function extractArchive(archive: ArchiveKind, file: string, work: string, runner: CommandRunner): void {
  if (archive === 'deb') return extractDeb(file, work, runner)
  const flag = archive === 'tar.xz' ? '-xJf' : '-xzf'
  runOrThrow(runner, { command: 'tar', args: [flag, file, '-C', work] }, `tar ${archive}`)
}

// A .deb is an `ar` archive whose data.tar.xz carries the real aarch64 binary Debian ships; extract it
// with ar then untar its data member, no dpkg needed (the zerotier sample's shape). `ar x` extracts to
// its cwd, so run it in the work dir where data.tar.xz then lands.
function extractDeb(file: string, work: string, runner: CommandRunner): void {
  runOrThrow(runner, { command: 'ar', args: ['x', file], cwd: work }, 'ar x (.deb)')
  runOrThrow(runner, { command: 'tar', args: ['-xf', join(work, 'data.tar.xz'), '-C', work] }, 'tar data.tar.xz (.deb)')
}

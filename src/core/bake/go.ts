// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { CommandRunner } from './runner.js'
import { runOrThrow } from './runner.js'
import type { GoBake } from './manifest-bake.js'

// Class 3: cross-compile a Go binary for the printer, pinned to an exact source commit, into the plugin
// payload. Reproduces prometheus-exporter/build.sh: clone the source, check out the pin, then
// `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go -C <src> build -o <out>` so the binary is fully static and
// portable across the printer's libc.
export function bakeGo(step: GoBake, pluginDir: string, runner: CommandRunner): void {
  const work = mkdtempSync(join(tmpdir(), 'b3-go-'))
  runOrThrow(runner, { command: 'git', args: ['clone', '--quiet', step.source, work] }, `git clone ${step.source}`)
  runOrThrow(runner, { command: 'git', args: ['-C', work, 'checkout', '--quiet', step.commit] }, `git checkout ${step.commit}`)
  // Absolute, never merely joined: `go -C <clone>` resolves a RELATIVE `-o` against the clone dir, so a
  // relative pluginDir (`--source ./prometheus-exporter`) would silently write the binary inside the
  // throwaway clone and leave the payload empty.
  const outputAbs = resolve(pluginDir, step.output)
  mkdirSync(dirname(outputAbs), { recursive: true })
  runOrThrow(
    runner,
    {
      command: 'go',
      args: ['-C', work, 'build', '-o', outputAbs, step.package],
      env: { GOOS: 'linux', GOARCH: 'arm64', CGO_ENABLED: '0' },
    },
    `go build ${step.source}`,
  )
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CommandResult, CommandRunner, CommandSpec } from '../../src/core/bake/runner.js'

// A recording runner for the per-class bake tests. It captures every command a baker constructs (so a
// test asserts the exact invocation, matching the legacy build.sh) and lets a per-call `simulate`
// produce the filesystem effect and stdout the real command would, so the baker's own staging / verify
// logic runs against a fixture output without executing docker / pip / go in the gate.
export interface FakeRun {
  calls: CommandSpec[]
  runner: CommandRunner
}

export function fakeRunner(simulate: (spec: CommandSpec) => CommandResult | void = () => undefined): FakeRun {
  const calls: CommandSpec[] = []
  const runner: CommandRunner = (spec) => {
    calls.push(spec)
    return simulate(spec) ?? { status: 0, stdout: '', stderr: '' }
  }
  return { calls, runner }
}

export function writeStub(path: string, content = 'stub'): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

// The value after a flag in an argv (e.g. the path after `-o`, the dest after `-d`), for a simulate that
// must know where the real command would have written.
export function argAfter(spec: CommandSpec, flag: string): string {
  const index = spec.args.indexOf(flag)
  return index >= 0 ? spec.args[index + 1] ?? '' : ''
}

// The nth recorded call, asserting it exists so a test reads the command at a known position without
// tripping over the index type. A missing call is a test-setup bug, surfaced loudly.
export function nth(calls: CommandSpec[], index: number): CommandSpec {
  const call = calls[index]
  if (call === undefined) throw new Error(`expected a recorded command at index ${index}, got ${calls.length} calls`)
  return call
}

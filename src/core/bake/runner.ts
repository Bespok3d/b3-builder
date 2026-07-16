import { spawnSync } from 'node:child_process'

// The external-command seam every baker shells out through. A baker never calls spawnSync directly:
// it takes a CommandRunner, so a real build runs the command and a unit test injects a fake runner
// that records the invocation and simulates its filesystem effect, without executing docker / pip / go
// in the gate. This is what lets the per-class tests prove each baker constructs the exact command the
// legacy build.sh runs, hermetically.
export interface CommandSpec {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  // Capture stdout (a command whose OUTPUT the baker reads, e.g. `modinfo -F vermagic`). Default
  // false: the command's own output streams straight to the user, matching the legacy scripts.
  capture?: boolean
}

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

export type CommandRunner = (spec: CommandSpec) => CommandResult

// The real runner: run the command, streaming its output (or capturing it when asked). A merged env so
// a baker can add GOOS / GOARCH without dropping the caller's PATH.
export const spawnRunner: CommandRunner = (spec) => {
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env === undefined ? process.env : { ...process.env, ...spec.env },
    encoding: 'utf8',
    stdio: spec.capture === true ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

// Run a command and fail loudly on a non-zero exit, so a broken baker never silently produces a
// half-built payload. `what` names the step in the domain (e.g. "git clone <url>") for the error.
export function runOrThrow(runner: CommandRunner, spec: CommandSpec, what: string): CommandResult {
  const result = runner(spec)
  if (result.status !== 0) {
    const detail = result.stderr.trim() === '' ? '' : `: ${result.stderr.trim()}`
    throw new Error(`${what} failed (exit ${result.status})${detail}`)
  }
  return result
}

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandRunner } from './runner.js'
import { runOrThrow } from './runner.js'

// Class 2 (ADR-0036): bake a plugin's Python deps for the PRINTER's platform (aarch64, glibc/manylinux
// 2014, CPython 3.11), never the build runner's, so the printer never runs pip. Presence-driven, not a
// manifest bake entry: ADR-0036 fixes the declaration as a plain requirements FILE. requirements.txt ->
// wheels for the plugin's own venv (installed offline on device); klipper_requirements.txt -> unpacked
// packages for a Klipper/Moonraker extra symlinked into the system site-packages. Reproduces
// scripts/bake-deps.sh, whose --only-binary=:all: makes the bake FAIL LOUDLY when a dep in the closure
// has no aarch64 wheel, rather than ship a broken .b3 to the printer.
const TARGET_PLATFORM = 'manylinux2014_aarch64'
const TARGET_PYTHON = '3.11'
const TARGET_IMPL = 'cp'

// The class-2 contract, declared once here and shared with the refuse-to-pack gate (assert-baked.ts):
// a root declaration FILE and the payload dir its baked output lands in. This baker WRITES the payload
// dir; the gate CHECKS the same dir is non-empty. Declaring the pair once keeps the two sides from
// drifting on where a wheel / unpacked package must be.
export const REQUIREMENTS_DECLARATION = 'requirements.txt'
export const WHEELS_PAYLOAD_DIR = join('files', 'wheels')
export const KLIPPER_REQUIREMENTS_DECLARATION = 'klipper_requirements.txt'
export const SITE_PACKAGES_PAYLOAD_DIR = join('files', 'site-packages')

export const PYTHON_DEP_ARTIFACTS: ReadonlyArray<{ declaration: string; payloadDir: string }> = [
  { declaration: REQUIREMENTS_DECLARATION, payloadDir: WHEELS_PAYLOAD_DIR },
  { declaration: KLIPPER_REQUIREMENTS_DECLARATION, payloadDir: SITE_PACKAGES_PAYLOAD_DIR },
]

export function bakePythonDeps(pluginDir: string, runner: CommandRunner): void {
  bakeWheels(pluginDir, runner)
  bakeSitePackages(pluginDir, runner)
}

function bakeWheels(pluginDir: string, runner: CommandRunner): void {
  const requirements = join(pluginDir, REQUIREMENTS_DECLARATION)
  if (!existsSync(requirements)) return
  const wheels = resetPayloadDir(join(pluginDir, WHEELS_PAYLOAD_DIR))
  downloadWheels(requirements, wheels, runner)
}

function bakeSitePackages(pluginDir: string, runner: CommandRunner): void {
  const requirements = join(pluginDir, KLIPPER_REQUIREMENTS_DECLARATION)
  if (!existsSync(requirements)) return
  const sitePackages = resetPayloadDir(join(pluginDir, SITE_PACKAGES_PAYLOAD_DIR))
  const wheelDir = mkdtempSync(join(tmpdir(), 'b3-wheels-'))
  downloadWheels(requirements, wheelDir, runner)
  wheelsIn(wheelDir).forEach((wheel) => unzipWheel(wheel, sitePackages, runner))
}

// Empty the payload dir before repopulating so the baked set is exactly what the current requirements
// resolve to. Without this, a stale wheel from an earlier build (a dep that has since floated to a newer
// version) survives beside the new one, and the printer's offline pip refuses two versions of one package.
function resetPayloadDir(payloadDir: string): string {
  rmSync(payloadDir, { recursive: true, force: true })
  mkdirSync(payloadDir, { recursive: true })
  return payloadDir
}

function downloadWheels(requirements: string, dest: string, runner: CommandRunner): void {
  runOrThrow(
    runner,
    {
      command: 'python3',
      args: [
        '-m', 'pip', 'download', '-r', requirements, '-d', dest,
        '--only-binary=:all:',
        '--platform', TARGET_PLATFORM,
        '--python-version', TARGET_PYTHON,
        '--implementation', TARGET_IMPL,
        '--abi', 'cp311', '--abi', 'abi3', '--abi', 'none',
      ],
    },
    `pip download ${requirements}`,
  )
}

function wheelsIn(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith('.whl')).map((name) => join(dir, name))
}

function unzipWheel(wheel: string, dest: string, runner: CommandRunner): void {
  runOrThrow(runner, { command: 'python3', args: ['-m', 'zipfile', '-e', wheel, dest] }, `unzip wheel ${wheel}`)
}

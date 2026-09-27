// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { JsonObject } from '../../src/core/types.js'

import { consumerSource } from './consumer-source.js'
export function fixtureFile(root: string, path: string, contents: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), contents)
}
export function consumerFixture(family: 'daemon' | 'jinni'): { root: string; name: string; manifest: string; runtime?: string } {
  const root = mkdtempSync(join(tmpdir(), `${family}-consumer-`))
  const repo = family === 'daemon' ? 'daemon' : 'adapters'
  const name = family === 'daemon' ? 'bespok3d-daemon' : 'bespok3d-jinni-snapmaker-u1'
  const manifest = family === 'daemon' ? 'manifest.json' : 'snapmaker-u1/jinni/manifest.json'
  mkdirSync(join(root, 'scripts'))
  ;['stage-package.sh', family === 'daemon' ? 'tag_version_guard.py' : 'tag_version_guard.sh'].forEach((script) => writeFileSync(join(root, 'scripts', script), consumerSource(`${repo}/scripts/${script}`)))
  fixtureFile(root, manifest, `${JSON.stringify({ name, version: '1.0.0-pre', publisher: 'PLACEHOLDER' } as JsonObject, null, 2)}\n`)
  if (family === 'daemon') {
    fixtureFile(root, 'version.py', '# Runtime version\nDAEMON_VERSION: str = "1.0.0-pre"\nPROTOCOL_VERSION = 7\n')
    ;['daemon.py', 'S99bespok3d', 's10bespok3d-daemon', 'requirements.txt', 'api/example.py', 'core/example.py', 'protocol/example.py', 'doc/README.md', 'doc/CHANGELOG.md'].forEach((path) => fixtureFile(root, path, path.endsWith('.py') ? 'VALUE = 1\n' : 'fixture\n'))
    return { root, name, manifest, runtime: 'version.py' }
  }
  fixtureFile(root, 'snapmaker-u1/jinni/device.py', 'DEVICE = "fixture"\n')
  fixtureFile(root, 'klipper-jinni/jinni/runtime.py', 'RUNTIME = 1\n')
  return { root, name, manifest }
}
export function stageConsumer(root: string): void {
  execFileSync('sh', ['scripts/stage-package.sh'], { cwd: root })
  if (root.includes('daemon-consumer-')) fixtureFile(root, 'dist/package/bespok3d-daemon/files/wheels/fixture.whl', 'identical dependency fixture bytes\n')
}
export function guardConsumer(root: string, family: 'daemon' | 'jinni', version: string): void {
  const command = family === 'daemon' ? 'python3' : 'sh'
  const guard = family === 'daemon' ? 'tag_version_guard.py' : 'tag_version_guard.sh'
  const prefix = family === 'daemon' ? 'daemon' : 'jinni-snapmaker-u1'
  execFileSync(command, [`scripts/${guard}`, `${prefix}-v${version}`], { cwd: root, stdio: 'pipe' })
}

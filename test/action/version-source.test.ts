// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { verifyVersionOnlyCommit } from '../../src/action/version-source.js'
import { prepareVersion } from '../../src/action/version-only.js'

it('compares separate candidate and Live commits, refusing any extra source change', () => {
  const directory = mkdtempSync(join(tmpdir(), 'version-commit-'))
  function git(args: string[]): string { return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim() }
  function commit(): string { git(['add', '.']); git(['commit', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']) }
  git(['init', '-q'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  writeFileSync(join(directory, 'manifest.json'), '{"name":"fixture","version":"1.0.0-pre"}\n')
  writeFileSync(join(directory, 'version.py'), 'DAEMON_VERSION = "1.0.0-pre"\n')
  writeFileSync(join(directory, 'payload.py'), 'VALUE = 1\n')
  const candidate = commit()
  prepareVersion(join(directory, 'manifest.json'), '1.0.0-pre', join(directory, 'version.py'))
  const live = commit()
  const fields = [{ path: 'manifest.json', candidateVersion: '1.0.0-pre', kind: 'manifest' as const }, { path: 'version.py', candidateVersion: '1.0.0-pre', kind: 'daemon-runtime' as const }]
  expect(candidate).not.toBe(live)
  expect(() => verifyVersionOnlyCommit(directory, candidate, live, fields)).not.toThrow()
  writeFileSync(join(directory, 'payload.py'), 'VALUE = 2\n')
  expect(() => verifyVersionOnlyCommit(directory, candidate, commit(), fields)).toThrow('exactly the enumerated version fields')
})

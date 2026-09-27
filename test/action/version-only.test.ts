// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { prepareCandidateVersion, prepareVersion, replaceRuntimeVersion, comparePromotionPackages } from '../../src/action/version-only.js'
import { packPlugin } from '../../src/core/build/archive.js'
import { stubPluginDir } from '../stub-plugin.js'

it('changes exactly the approved manifest literal and runtime assignment, preserving all surrounding bytes', () => {
  const source = stubPluginDir({ name: 'daemon-fixture', version: '1.2.3' })
  const manifestPath = join(source, 'manifest.json')
  const runtime = join(source, 'files/version.py')
  const manifestBytes = readFileSync(manifestPath, 'utf8')
  const runtimeBytes = '# 1.2.3 is mentioned here\nDAEMON_VERSION: str = \'1.2.3\'  # retained\nMIN_VERSION = "1.2.3"\n'
  writeFileSync(runtime, runtimeBytes)
  prepareCandidateVersion(manifestPath, '1.2.3', runtime)
  expect(readFileSync(runtime, 'utf8')).toBe(runtimeBytes.replace("= '1.2.3'", "= '1.2.3-pre'"))
  prepareVersion(manifestPath, '1.2.3-pre', runtime)
  expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBytes)
  expect(readFileSync(runtime, 'utf8')).toBe(runtimeBytes)
  expect(() => replaceRuntimeVersion(runtimeBytes + 'DAEMON_VERSION="1.2.3"\n', '1.2.3', '1.2.3-pre')).toThrow('assignment')
})

it.each(['files/version.py', 'files/bin/demo-aarch64'])('rejects a non-version change in %s even when normal packing recomputes its checksum', (path) => {
  const candidateManifest = { name: 'daemon-fixture', version: '1.2.3-pre' }
  const source = stubPluginDir(candidateManifest)
  writeFileSync(join(source, 'files/version.py'), 'DAEMON_VERSION = "1.2.3-pre"\nOTHER = 1\n')
  const candidate = packPlugin(candidateManifest, source, source)
  prepareVersion(join(source, 'manifest.json'), '1.2.3-pre', join(source, 'files/version.py'))
  writeFileSync(join(source, path), `${readFileSync(join(source, path), 'utf8')}# behavior mutation\n`)
  const live = packPlugin({ ...candidateManifest, version: '1.2.3' }, source, source)
  expect(() => comparePromotionPackages(candidate.path, live.path, '1.2.3-pre', true)).toThrow('non-version')
})

it('rejects an archive permission-mode change despite identical payload bytes', async () => {
  const { default: AdmZip } = await import('adm-zip')
  const manifest = { name: 'mode-fixture', version: '1.0.0-pre' }
  const source = stubPluginDir(manifest)
  const candidate = packPlugin(manifest, source, source)
  const live = packPlugin({ ...manifest, version: '1.0.0' }, source, source)
  const archive = new AdmZip(live.path)
  archive.getEntry('files/bin/demo-aarch64')!.attr = 0o100755 << 16
  archive.writeZip(live.path)
  expect(() => comparePromotionPackages(candidate.path, live.path, '1.0.0-pre', false)).toThrow('modes changed')
})

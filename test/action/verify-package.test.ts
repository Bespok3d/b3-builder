// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import { generateKey } from 'openpgp'
import { expect, it } from 'vitest'
import { runPipeline } from '../../src/core/pipeline.js'
import { verifyPackage } from '../../src/action/verify-package.js'
import { stubPluginDir } from '../stub-plugin.js'

async function fixturePackage() {
  const { privateKey, publicKey } = await generateKey({ type: 'ecc', userIDs: [{ name: 'package fixture' }], format: 'armored' })
  const built = await runPipeline({ unit: 'plugin', sourceDir: stubPluginDir({ name: 'fixture', version: '1.0.0' }), outputDir: mkdtempSync(join(tmpdir(), 'verify-package-')), identity: { atomRepo: 'fixture/repo' }, signingKey: privateKey })
  return { path: built.packages[0]!.path, publicKey }
}
it('refuses a missing required package signature independently of index trust', async () => {
  const { path, publicKey } = await fixturePackage()
  const archive = new AdmZip(path)
  archive.deleteFile('manifest.json.sig')
  archive.writeZip(path)
  await expect(verifyPackage(path, publicKey, true)).rejects.toThrow('signature missing')
})
it('refuses a bad signature over otherwise complete package bytes', async () => {
  const { path, publicKey } = await fixturePackage()
  const archive = new AdmZip(path)
  const manifest = JSON.parse(archive.readAsText('manifest.json')) as { version: string }
  manifest.version = '1.0.1'
  archive.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
  archive.writeZip(path)
  await expect(verifyPackage(path, publicKey, true)).rejects.toThrow('invalid package signature')
})
it('refuses unlisted payload members despite a valid manifest signature', async () => {
  const { path, publicKey } = await fixturePackage()
  const archive = new AdmZip(path)
  archive.addFile('files/unlisted', Buffer.from('untrusted'))
  archive.writeZip(path)
  await expect(verifyPackage(path, publicKey, true)).rejects.toThrow('inventory differs')
})

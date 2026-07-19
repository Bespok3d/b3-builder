import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonObject } from '../src/core/index.js'

// A minimal plugin dir with one staged payload file, so a pack has a real files/ tree to checksum.
// Shared by every test that needs a throwaway plugin to build rather than a real sibling plugin repo.
export function stubPluginDir(manifest: JsonObject): string {
  const pluginDir = mkdtempSync(join(tmpdir(), 'b3-stub-plugin-'))
  writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync(join(pluginDir, 'files/bin'), { recursive: true })
  writeFileSync(join(pluginDir, 'files/bin/demo-aarch64'), 'staged payload\n')
  return pluginDir
}

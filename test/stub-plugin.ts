import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonObject } from '../src/core/index.js'

// A minimal plugin dir with one staged payload file, so a pack has a real files/ tree to checksum.
// Shared by every test that needs a throwaway plugin to build rather than a real sibling plugin repo.
// Given a repo dir, the plugin lands inside it under its own manifest name, because a repo build
// discovers its plugins as the immediate subdirs of one source dir.
export function stubPluginDir(manifest: JsonObject, repoDir?: string): string {
  const pluginDir = pluginDirIn(repoDir, manifest)
  writeFileSync(join(pluginDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync(join(pluginDir, 'files/bin'), { recursive: true })
  writeFileSync(join(pluginDir, 'files/bin/demo-aarch64'), 'staged payload\n')
  return pluginDir
}

function pluginDirIn(repoDir: string | undefined, manifest: JsonObject): string {
  if (repoDir === undefined) return mkdtempSync(join(tmpdir(), 'b3-stub-plugin-'))
  const pluginDir = join(repoDir, String(manifest.name))
  mkdirSync(pluginDir, { recursive: true })
  return pluginDir
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonObject, PackedPackage } from '../types.js'
import { packPlugin, packageFilename } from './archive.js'
import { pluginFingerprint } from './fingerprint.js'

const FINGERPRINT_SUFFIX = '.fp'

// Pack a plugin only if its fingerprint changed since the last build into this output dir. The
// fingerprint (see fingerprint.ts) lives in a sidecar `<name>-<version>.b3.fp` beside the .b3; an
// existing .b3 whose sidecar matches the current fingerprint is reused untouched (skipped), so a caller
// iterating a large plugin set repacks only what actually changed. A per-.b3 sidecar (not one shared
// store) keeps a per-dir invocation race-free: each build touches only its own plugin's files.
export function packIfChanged(
  manifest: JsonObject,
  pluginDir: string,
  outputDir: string,
  builderVersion: string,
): PackedPackage {
  const filename = packageFilename(manifest)
  const b3Path = join(outputDir, filename)
  const fingerprint = pluginFingerprint(pluginDir, builderVersion)
  if (existsSync(b3Path) && readSidecar(`${b3Path}${FINGERPRINT_SUFFIX}`) === fingerprint) {
    return { filename, path: b3Path, skipped: true }
  }
  const packed = packPlugin(manifest, pluginDir, outputDir)
  writeFileSync(`${packed.path}${FINGERPRINT_SUFFIX}`, fingerprint)
  return { ...packed, skipped: false }
}

function readSidecar(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

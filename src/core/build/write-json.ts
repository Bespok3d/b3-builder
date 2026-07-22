import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { JsonValue } from '../types.js'

// The canonical serialization the whole system uses: 2-space indent, one trailing newline. Exported
// separately from the write because a detached signature covers exactly these bytes, and a signer that
// re-stringified the same value with its own framing would produce a signature the app rejects over the
// bytes it was served. Everything in this repo that needs the published bytes of a registry artifact
// asks here rather than repeating the framing.
export function canonicalJsonBytes(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

// Write a registry artifact (an atom or a sub-list) in that serialization. Content matches the legacy
// generators (the rail compares parsed content); the exact KEY ORDER does not, so this is not a
// byte-for-byte reproduction of a legacy file, just the same canonical shape. Ensures the parent dir
// exists so a build that discovered zero plugins (nothing packed, so the output dir was never created
// by the packer) writes an empty index cleanly instead of throwing ENOENT.
export function writeJsonFile(path: string, value: JsonValue): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, canonicalJsonBytes(value))
}

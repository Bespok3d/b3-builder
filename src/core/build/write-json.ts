import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { JsonValue } from '../types.js'

// Write a registry artifact (an atom or a sub-list) in the canonical
// serialization the whole system uses: 2-space indent, one trailing newline. Content matches the legacy
// generators (the rail compares parsed content); the exact KEY ORDER does not, so this is not a
// byte-for-byte reproduction of a legacy file, just the same canonical shape. Ensures the parent dir
// exists so a build that discovered zero plugins (nothing packed, so the output dir was never created
// by the packer) writes an empty index cleanly instead of throwing ENOENT.
export function writeJsonFile(path: string, value: JsonValue): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

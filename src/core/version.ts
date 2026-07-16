import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The builder's own version, read from package.json (the single source, never hand-mirrored). It is a
// fingerprint input for skip-if-unchanged: a builder upgrade that could change packing output must
// invalidate every cached .b3, even when a plugin's own sources are untouched. Both src/core/ and the
// emitted dist/core/ sit two levels under the package root, so the same relative path resolves in each.
export function builderVersion(): string {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const parsed = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version?: string }
  return parsed.version ?? '0.0.0'
}

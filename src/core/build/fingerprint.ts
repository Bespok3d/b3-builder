import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { buildFilesArray, sha256OfFile, walkManifestPayload } from './file-tree.js'
import { readManifest } from './plugin-source.js'

// The change-detection fingerprint for a plugin dir: a sha256 folding together everything that
// materially enters its .b3, so skip-if-unchanged reuses an existing package only when a repack would
// produce equivalent content. The inputs are (1) the builder version (a builder upgrade that could
// change packing output invalidates every cached .b3), (2) the source manifest content (its own fields,
// and transitively the files[] the packer derives from the payload), (3) the manifest-filtered files/
// payload by path + content sha256 + mode, and (4) the filtered doc/ tree by path + content sha256. It
// is deliberately the FILTERED file set (walkManifestPayload's exclusions), not the whole-tree walk the
// zip uses: junk a plugin never meaningfully packs (__pycache__, *.pyc, .DS_Store) must never trigger a
// spurious rebuild. Reuses the sha256-reduce primitive the dev build-tag was built on.
export function pluginFingerprint(pluginDir: string, builderVersion: string): string {
  const manifest = readManifest(pluginDir)
  const payload = buildFilesArray(pluginDir)
  const seed = createHash('sha256')
    .update(builderVersion)
    .update('\0')
    .update(JSON.stringify(manifest))
    .update('\0')
    .update(hashFilteredTree(join(pluginDir, 'doc')))
    .update('\0')
  const digest = payload.reduce(
    (hash, entry) => hash.update(entry.path).update('\0').update(entry.sha256).update('\0').update(entry.mode).update('\0'),
    seed,
  )
  return digest.digest('hex')
}

// A content digest of one filtered tree (path + content sha256, path-sorted for stability). A missing
// root walks to [], yielding the stable empty digest, so a plugin without a doc/ dir is not special.
function hashFilteredTree(root: string): string {
  const files = [...walkManifestPayload(root)].sort((earlier, later) => earlier.localeCompare(later))
  const digest = files.reduce(
    (hash, absPath) => hash.update(relative(root, absPath)).update('\0').update(sha256OfFile(absPath)).update('\0'),
    createHash('sha256'),
  )
  return digest.digest('hex')
}

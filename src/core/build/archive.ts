import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import AdmZip from 'adm-zip'
import type { JsonObject, PackedPackage } from '../types.js'
import { asString, omitFields } from './json.js'
import { DEP_DECLARATION_NAMES, buildFilesArray, walkAllFiles } from './file-tree.js'

// The manifest's `bake` field is BUILD-time metadata (HOW to produce the payload): the daemon ignores it
// and the catalog atom never carries it, so a packed .b3 drops it rather than ship build recipes (upstream
// URLs, sha pins, Dockerfile paths, kernel vermagic) to every device. Extend this list if a future
// build-only field appears.
const BUILD_ONLY_MANIFEST_FIELDS = ['bake']

// The .b3 filename a manifest resolves to (`<name>-<version>.b3`). One helper so the packer and the
// skip-unchanged sidecar name the same file the same way.
export function packageFilename(manifest: JsonObject): string {
  return `${asString(manifest.name)}-${asString(manifest.version)}.b3`
}

// Packs one plugin source dir into a .b3: the checksummed manifest (files[] filled in with real
// sha256/mode), the files/ tree, the doc/ tree, and the root ADR-0036 Python-dep declarations. Ports
// the two legacy shell packers (the app packer's pack_plugin and a co-repo pack.sh's pack_one), which
// build the same archive shape; the only difference between them (auto-bump / lockfile / pruning) is
// about WHETHER and WHEN to pack, never about the archive's content, so one packer serves every caller.
//
// The zip content and the manifest's checksummed files[] are DELIBERATELY built from two different
// walks: `zip -qr $output files/` archives the files/ tree as-is (junk included), while build_files_
// array excludes __pycache__/*.pyc/.DS_Store from what gets checksummed. A stray .pyc therefore ships
// in the .b3 unlisted; that legacy quirk is part of the byte-for-byte target, not a bug to fix here.
export function packPlugin(manifest: JsonObject, pluginDir: string, outputDir: string): PackedPackage {
  const filename = packageFilename(manifest)
  const path = join(outputDir, filename)

  const files = buildFilesArray(pluginDir)
  const packedManifest: JsonObject = {
    ...omitFields(manifest, BUILD_ONLY_MANIFEST_FIELDS),
    files: files.map((entry) => ({ path: entry.path, sha256: entry.sha256, mode: entry.mode })),
  }

  mkdirSync(outputDir, { recursive: true })
  const zip = new AdmZip()
  addTree(zip, pluginDir, join(pluginDir, 'files'))
  addTree(zip, pluginDir, join(pluginDir, 'doc'))
  DEP_DECLARATION_NAMES.map((depName) => join(pluginDir, depName))
    .filter((depPath) => existsSync(depPath))
    .forEach((depPath) => zip.addFile(relative(pluginDir, depPath), readFileSync(depPath)))
  zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(packedManifest, null, 2)}\n`))
  zip.writeZip(path)

  return { filename, path }
}

function addTree(zip: AdmZip, pluginDir: string, treeRoot: string): void {
  walkAllFiles(treeRoot).forEach((absPath) => zip.addFile(relative(pluginDir, absPath), readFileSync(absPath)))
}

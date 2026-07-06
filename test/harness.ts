import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import type { JsonObject, JsonValue, PackedPackage } from '../src/core/index.js'

// Shared machinery for the golden-equivalence harness, used by BOTH the capture tool (which writes
// the golden from the current legacy scripts) and the equivalence test (which builds a candidate via
// the b3-builder core and compares). One implementation of "describe a .b3 by its content" keeps the
// captured golden and the compared candidate measured the same way.

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_DIR = dirname(HERE)
export const WORKSPACE_DIR = dirname(REPO_DIR)
export const BESPOK3D_DIR = join(WORKSPACE_DIR, 'Bespok3d')
export const NETWORKING_DIR = join(WORKSPACE_DIR, 'plugins', 'networking')
export const GOLDEN_DIR = join(REPO_DIR, 'test', 'golden')

export interface ArchiveEntry {
  path: string
  sha256: string
}

// A .b3's content, measured in a serializer-independent, zip-framing-independent way. `entries` is
// every archived payload / doc file by content hash (the byte-exact invariant); `manifest` is the
// packed manifest.json as a parsed object (compared by content, since its serialized bytes are an
// incidental artifact of whichever tool wrote it). Two .b3 with equal descriptions carry identical
// content even if their zip bytes (mtimes, ordering, compression) differ. That is the meaning of
// "byte-for-byte" the equivalence rail enforces for a package.
export interface ArchiveDescription {
  entries: ArchiveEntry[]
  manifest: JsonObject
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function entryPath(fileEntry: JsonValue): string {
  if (typeof fileEntry !== 'object' || fileEntry === null || Array.isArray(fileEntry)) return ''
  const path = fileEntry.path
  return typeof path === 'string' ? path : ''
}

// The packed manifest's `files` array is generated and sorted by the packer (the legacy shell packer
// uses an LC_ALL=C byte sort). Its ORDER is not behaviorally meaningful: the daemon iterates the array
// to place and chmod files, it does not depend on the order. So the comparison normalizes the order
// (both golden and candidate pass through here identically), which tests the real invariant (the same
// set of files with the same sha256 and mode) without forcing a ported packer to reproduce one
// particular sort. Every other manifest array comes from the source manifest verbatim, so it matches
// by construction.
function normalizeManifest(manifest: JsonObject): JsonObject {
  const files = manifest.files
  if (!Array.isArray(files)) return manifest
  const sorted = [...files].sort((earlier, later) => entryPath(earlier).localeCompare(entryPath(later)))
  return { ...manifest, files: sorted }
}

export function describeArchive(b3Path: string): ArchiveDescription {
  const files = new AdmZip(b3Path).getEntries().filter((entry) => !entry.isDirectory)
  const manifestEntry = files.find((entry) => entry.entryName === 'manifest.json')
  if (manifestEntry === undefined) {
    throw new Error(`${b3Path} has no manifest.json entry`)
  }
  const manifest = normalizeManifest(JSON.parse(manifestEntry.getData().toString('utf8')) as JsonObject)
  const entries = files
    .filter((entry) => entry.entryName !== 'manifest.json')
    .map((entry) => ({ path: entry.entryName, sha256: sha256Hex(entry.getData()) }))
    .sort((earlier, later) => earlier.path.localeCompare(later.path))
  return { entries, manifest }
}

// Describe a produced .b3 set as the golden's { filename: description } map, so a candidate build and
// the committed golden compare with one deep-equal. Two packages resolving to one filename would
// silently overwrite in the map (a collision the legacy generate-index hard-fails on via
// assertUniqueAtoms), so refuse it rather than let the rail pass on a package-collision bug.
export function describePackages(packages: PackedPackage[]): Record<string, ArchiveDescription> {
  const seen = new Set<string>()
  packages.forEach((packed) => {
    if (seen.has(packed.filename)) {
      throw new Error(`duplicate packed filename ${packed.filename} (two source manifests resolved to one .b3)`)
    }
    seen.add(packed.filename)
  })
  return Object.fromEntries(packages.map((packed) => [packed.filename, describeArchive(packed.path)]))
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

// Every file under each `<name>/doc/` tree staged beside the bundled index, as
// { "<name>/doc/<relpath>": sha256 }. This loose doc tree is what the app reads for a bundled plugin's
// doc_url / changelog_url; it is a monorepo-build output DISTINCT from the doc/ copy inside each .b3,
// so the rail covers it too (otherwise a port could match every .b3 and the index yet stage no docs).
export function describeStagedDocs(root: string): Record<string, string> {
  const plugins = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  const pairs = plugins.flatMap((plugin) => stagedDocPairs(root, plugin.name))
  return Object.fromEntries(pairs)
}

function stagedDocPairs(root: string, pluginName: string): Array<[string, string]> {
  const docDir = join(root, pluginName, 'doc')
  if (!existsSync(docDir)) return []
  return filesUnder(docDir).map((absPath) => [relative(root, absPath), sha256Hex(readFileSync(absPath))])
}

function atomName(atom: JsonObject): string {
  return typeof atom.name === 'string' ? atom.name : ''
}

// Order a set of atoms by their plugin name with one comparator, so the golden side and the candidate
// side are ordered identically before a deep-equal (a name-array comparison is order-sensitive).
export function sortAtomsByName(atoms: JsonObject[]): JsonObject[] {
  return [...atoms].sort((earlier, later) => atomName(earlier).localeCompare(atomName(later)))
}

// The canonical JSON serialization the whole system uses (2-space, trailing newline): the exact form
// generate-index.mjs writes, so a committed golden JSON file round-trips byte-identically.
export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function loadJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonObject
}

export function goldenPath(...parts: string[]): string {
  return join(GOLDEN_DIR, ...parts)
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import type { JsonObject, JsonValue, PackedPackage } from '../src/core/index.js'

// Shared machinery for the golden-equivalence harness: one implementation of "describe a .b3 by its
// content", so the frozen golden (captured from the legacy scripts when they still existed) and the
// candidate the core builds today are measured the same way.

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = dirname(HERE)
const WORKSPACE_DIR = dirname(REPO_DIR)
const GOLDEN_DIR = join(REPO_DIR, 'test', 'golden')

// The two source repos the rail builds: networking, a repo that publishes its own sub-list, and
// fluidd, an atom repo that registers into someone else's index.
export const NETWORKING_DIR = join(WORKSPACE_DIR, 'plugins', 'networking')
export const FLUIDD_DIR = join(WORKSPACE_DIR, 'plugins', 'fluidd-plugin')
export const ALL_THE_TAGS_DIR = join(WORKSPACE_DIR, 'plugins', 'all-the-tags')

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

// The doc/ tree is OUT of the equivalence set, on both sides, in files[] and in the archived entries.
// Two reasons, and neither is a weakening of the rail:
//
// - files[]: the legacy packers left doc/ out of it and we now list it, because an unlisted zip member
//   is an unsigned zip member (see buildFilesArray). That divergence is the point of the change, so
//   comparing it would fail every golden case for the fix itself.
// - entries: doc/ holds a plugin's README, CHANGELOG and ATTRIBUTIONS, prose that is edited on its own
//   schedule and reaches no printer behaviour. A documentation edit turning the BUILD-equivalence rail
//   red is the defect, not the information the rail exists to carry: what the rail pins is that the
//   payload and the manifest a printer acts on reproduce the legacy output.
//
// What this stops pinning (that doc/ entries carry a correct sha256 and mode, and are archived at all)
// is covered directly by the "lists every payload member it archives" test in archive.test.ts.
function isDocPath(path: string): boolean {
  return path.startsWith('doc/')
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
  const sorted = [...files]
    .filter((fileEntry) => !isDocPath(entryPath(fileEntry)))
    .sort((earlier, later) => entryPath(earlier).localeCompare(entryPath(later)))
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
    .filter((entry) => entry.entryName !== 'manifest.json' && !isDocPath(entry.entryName))
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

// The frozen golden was captured before doc/ left the equivalence set, so it still carries a doc/ entry
// per package. The fixture is NOT edited to drop them (it stays the real legacy output); the same rule
// that filters the candidate filters it here, at load, so one implementation decides what is compared.
export function loadGoldenPackages(path: string): Record<string, ArchiveDescription> {
  const golden = loadJson(path) as unknown as Record<string, ArchiveDescription>
  return Object.fromEntries(
    Object.entries(golden).map(([filename, description]) => [
      filename,
      { ...description, entries: description.entries.filter((entry) => !isDocPath(entry.path)) },
    ]),
  )
}

// The assembled sub-list's `assembled_at` is OUT of the equivalence set, and this is a divergence of the
// same kind as doc/ above, not a weakening. The field is the instant the run happened (see
// co-repo-index.assemblyStamp): the legacy scripts never wrote it, a frozen fixture could not carry it,
// and no comparison against a fixture could ever match a moving value. What the rail pins is that the
// catalog content reproduces the legacy output; that the stamp exists and reads as a real UTC instant is
// pinned directly instead, by co-repo-index.test.ts over the file the assembly actually wrote.
export function withoutAssemblyStamp(subList: JsonObject): JsonObject {
  const { assembled_at: _assembledAt, ...catalog } = subList
  return catalog
}

function atomName(atom: JsonObject): string {
  return typeof atom.name === 'string' ? atom.name : ''
}

// Order a set of atoms by their plugin name with one comparator, so the golden side and the candidate
// side are ordered identically before a deep-equal (a name-array comparison is order-sensitive).
export function sortAtomsByName(atoms: JsonObject[]): JsonObject[] {
  return [...atoms].sort((earlier, later) => atomName(earlier).localeCompare(atomName(later)))
}

export function loadJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonObject
}

export function goldenPath(...parts: string[]): string {
  return join(GOLDEN_DIR, ...parts)
}

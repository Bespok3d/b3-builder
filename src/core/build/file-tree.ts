// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Walking a plugin's files/ and doc/ trees, and normalizing what the legacy shell packers computed
// per file (a sha256 and a 644/755 mode), ported from pack-plugins.sh's build_files_array and the
// networking co-repo's pack.sh (which do the same walk with slightly different mode checks that agree
// on every real fixture, since git only ever checks out a file as 644 or 755).

// The ADR-0036 Python-dep declarations a plugin may carry at its root (outside files/): the daemon
// reads these from the unpacked plugin dir to provision the venv, so they ship in the .b3 alongside
// files/ and are listed in the checksummed manifest like the rest of the payload.
export const DEP_DECLARATION_NAMES = ['requirements.txt', 'klipper_requirements.txt']

const EXCLUDED_NAMES = new Set(['.DS_Store'])

function isExcluded(fileName: string): boolean {
  return EXCLUDED_NAMES.has(fileName) || fileName.endsWith('.pyc')
}

// The payload files under root, skipping __pycache__ dirs and build junk (*.pyc, .DS_Store). This one
// walk drives BOTH what goes into the zip and what gets checksummed into manifest.json, so every packed
// member under files/ is a member of files[]. The legacy shell packers used two divergent walks (`zip
// -qr` archived junk that build_files_array never checksummed), which shipped unlisted, unsigned files
// inside the .b3; the goldens contain no junk, so collapsing to one walk keeps their content-hash
// equivalence and closes that hole.
export function walkPackedFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = join(root, entry.name)
    if (entry.isDirectory()) return entry.name === '__pycache__' ? [] : walkPackedFiles(full)
    return entry.isFile() && !isExcluded(entry.name) ? [full] : []
  })
}

export function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// Mirrors `case "$mode" in *7*) 755 ;; *) 644 ;;` (pack-plugins.sh) and `[ -x "$1" ]` (networking's
// pack.sh): both reduce, for every real checked-out file, to "does this file have an execute bit."
export function normalizeMode(absPath: string): '644' | '755' {
  const mode = statSync(absPath).mode
  return (mode & 0o111) !== 0 ? '755' : '644'
}

export interface FileArrayEntry {
  path: string
  sha256: string
  mode: '644' | '755'
}

// The manifest.files[] entries for EVERY member the packer puts in the .b3: the files/ tree, the doc/
// tree, and the root-level ADR-0036 Python-dep declarations (requirements.txt / klipper_requirements.txt),
// sorted by path. Plain string sort matches LC_ALL=C byte order for the ASCII paths every plugin ships.
//
// doc/ is listed even though the daemon never installs it, because an unlisted zip member is an unsigned
// zip member: the signature covers manifest.json, and manifest.json vouches for a file only by listing its
// sha256. A verifier therefore rejects a .b3 carrying any member files[] does not account for, so the
// packer must account for all of them. Only manifest.json and manifest.json.sig stay unlisted, and only
// because they cannot be listed: files[] lives inside manifest.json (a file cannot carry its own hash) and
// the signature does not exist until after the manifest is final. The legacy shell packers left doc/
// unlisted, which is why the frozen goldens differ here; see test/harness.ts.
export function buildFilesArray(pluginDir: string): FileArrayEntry[] {
  const payload = walkPackedFiles(join(pluginDir, 'files'))
  const documentation = walkPackedFiles(join(pluginDir, 'doc'))
  const depDeclarations = DEP_DECLARATION_NAMES
    .map((name) => join(pluginDir, name))
    .filter((path) => existsAsFile(path))
  return [...payload, ...documentation, ...depDeclarations]
    .map((absPath) => ({
      path: relative(pluginDir, absPath),
      sha256: sha256OfFile(absPath),
      mode: normalizeMode(absPath),
    }))
    .sort((earlier, later) => earlier.path.localeCompare(later.path))
}

function existsAsFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

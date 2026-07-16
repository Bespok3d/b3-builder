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

// Every file under root, no exclusion: this is what `zip -qr $output files/` (and `doc/`) actually
// archives. Legacy's __pycache__/*.pyc/.DS_Store exclusion applies ONLY to the checksummed manifest
// entry list (see walkManifestPayload), never to the zip content itself, so a stray .pyc ships in the
// .b3 unlisted. Reproducing that quirk is required for the golden's content-hash equivalence.
export function walkAllFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = join(root, entry.name)
    if (entry.isDirectory()) return walkAllFiles(full)
    return entry.isFile() ? [full] : []
  })
}

// The files/ tree as it is CHECKSUMMED into manifest.json, skipping __pycache__ dirs and the junk
// files pack-plugins.sh's build_files_array excludes from the manifest entry list.
export function walkManifestPayload(root: string): string[] {
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = join(root, entry.name)
    if (entry.isDirectory()) return entry.name === '__pycache__' ? [] : walkManifestPayload(full)
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

// The manifest.files[] entries for a plugin's payload: the files/ tree plus the root-level ADR-0036
// Python-dep declarations (requirements.txt / klipper_requirements.txt), sorted by path. Plain string
// sort matches LC_ALL=C byte order for the ASCII paths every plugin ships.
export function buildFilesArray(pluginDir: string): FileArrayEntry[] {
  const filesDir = join(pluginDir, 'files')
  const payload = walkManifestPayload(filesDir)
  const depDeclarations = DEP_DECLARATION_NAMES
    .map((name) => join(pluginDir, name))
    .filter((path) => existsAsFile(path))
  return [...payload, ...depDeclarations]
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

#!/usr/bin/env node
// RULE ZERO guard: fail the gate if any authored file contains an em-dash or en-dash. No linter
// enforces RULE ZERO, so this walks the repo and exits non-zero on any offender. Only authored text
// formats are scanned, by suffix; build output, installed deps, git internals, and the committed
// golden fixtures (external build output, a faithful reproduction target we do not author) are
// skipped. The dash codepoints are written as escapes here so the guard never trips on itself.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const SCANNED_SUFFIXES = ['.ts', '.mjs', '.js', '.json', '.md', '.sh', '.yml', '.yaml']
const EXCLUDED_DIRS = new Set(['dist', 'node_modules', '.git'])
const EXCLUDED_PATHS = [join('test', 'golden')]

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return EXCLUDED_DIRS.has(entry.name) ? [] : walk(full)
    return [full]
  })
}

function isExcludedPath(rel) {
  return EXCLUDED_PATHS.some((excluded) => rel === excluded || rel.startsWith(excluded + sep))
}

function isScanned(path) {
  const rel = relative(repoRoot, path)
  if (isExcludedPath(rel)) return false
  return SCANNED_SUFFIXES.some((suffix) => path.endsWith(suffix))
}

function hasBannedDash(path) {
  const text = readFileSync(path, 'utf8')
  return text.includes(EM_DASH) || text.includes(EN_DASH)
}

const offenders = walk(repoRoot).filter(isScanned).filter(hasBannedDash)
offenders.forEach((path) => console.error(`RULE ZERO violation (em-dash/en-dash): ${relative(repoRoot, path)}`))
process.exit(offenders.length > 0 ? 1 : 0)

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs'
import type { JsonObject } from '../core/types.js'
import { packageContents, sha256 } from './verify-package.js'

export function liveVersion(candidate: string): string {
  if (!candidate.endsWith('-pre') || candidate === '-pre') throw new Error('candidate version must end in -pre')
  return candidate.slice(0, -4)
}

export function replaceRuntimeVersion(source: string, candidate: string, live: string): string {
  const assignment = /^(DAEMON_VERSION\s*(?::\s*str\s*)?=\s*)(['"])([^'"\r\n]+)\2/gm
  const matches = [...source.matchAll(assignment)]
  if (matches.length !== 1 || matches[0]![3] !== candidate) throw new Error('expected exact DAEMON_VERSION assignment is missing')
  return source.replace(assignment, (_match, prefix: string, quote: string) => `${prefix}${quote}${live}${quote}`)
}

export function prepareVersion(manifestPath: string, candidate: string, runtimePath?: string): void {
  prepareExactVersion(manifestPath, candidate, liveVersion(candidate), runtimePath)
}

export function prepareCandidateVersion(manifestPath: string, live: string, runtimePath?: string): void {
  if (!live || live.endsWith('-pre')) throw new Error('expected a Live version for candidate preparation')
  prepareExactVersion(manifestPath, live, `${live}-pre`, runtimePath)
}

function prepareExactVersion(manifestPath: string, candidate: string, live: string, runtimePath?: string): void {
  const source = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(source) as JsonObject
  if (manifest.version !== candidate) throw new Error('manifest does not match approved candidate version')
  const changedManifest = replaceManifestVersion(source, candidate, live)
  const changedRuntime = runtimePath === undefined ? undefined : replaceRuntimeVersion(readFileSync(runtimePath, 'utf8'), candidate, live)
  writeFileSync(manifestPath, changedManifest)
  if (runtimePath !== undefined) writeFileSync(runtimePath, changedRuntime!)
}

export function replaceManifestVersion(source: string, candidate: string, live: string): string {
  const parsed = JSON.parse(source) as JsonObject
  const matches = [...source.matchAll(/"version"\s*:\s*"([^"\r\n]+)"/g)].filter((match) => match[1] === candidate)
  if (parsed.version !== candidate || matches.length !== 1) throw new Error('ambiguous manifest version field')
  const match = matches[0]!
  return source.slice(0, match.index) + match[0].replace(JSON.stringify(candidate), JSON.stringify(live)) + source.slice(match.index! + match[0].length)
}

export function comparePromotionPackages(candidatePath: string, livePath: string, candidateVersion: string, daemon: boolean): void {
  const candidate = packageContents(candidatePath)
  const live = packageContents(livePath)
  const targetVersion = liveVersion(candidateVersion)
  if (candidate.manifest.version !== candidateVersion || live.manifest.version !== targetVersion) throw new Error('promotion versions mismatch')
  const candidatePaths = [...candidate.entries.keys()].filter((path) => path !== 'manifest.json.sig').sort()
  const livePaths = [...live.entries.keys()].filter((path) => path !== 'manifest.json.sig').sort()
  if (JSON.stringify(candidatePaths) !== JSON.stringify(livePaths)) throw new Error('promotion package paths changed')
  if (JSON.stringify(payloadModes(candidate.modes)) !== JSON.stringify(payloadModes(live.modes))) throw new Error('promotion archive paths or modes changed')
  const runtime = daemon ? 'files/version.py' : undefined
  const normalized = normalizedCandidate(candidate.manifest, candidate.entries, candidateVersion, targetVersion, runtime)
  if (JSON.stringify(normalized) !== JSON.stringify(live.manifest)) throw new Error('non-version manifest change in promotion')
  candidatePaths.filter((path) => path !== 'manifest.json').forEach((path) => {
    const candidateBytes = candidate.entries.get(path)!
    const expected = path === runtime ? Buffer.from(replaceRuntimeVersion(candidateBytes.toString('utf8'), candidateVersion, targetVersion)) : candidateBytes
    if (!expected.equals(live.entries.get(path)!)) throw new Error(`non-version payload change: ${path}`)
  })
}

function normalizedCandidate(manifest: JsonObject, entries: Map<string, Buffer>, candidate: string, live: string, runtime?: string): JsonObject {
  const normalized = structuredClone(manifest)
  normalized.version = live
  if (runtime === undefined) return normalized
  const bytes = entries.get(runtime)
  if (!bytes) throw new Error('daemon version.py is missing')
  const files = normalized.files as JsonObject[]
  const runtimeEntry = files.find((entry) => entry.path === runtime)
  if (!runtimeEntry) throw new Error('daemon version.py is absent from manifest inventory')
  runtimeEntry.sha256 = sha256(Buffer.from(replaceRuntimeVersion(bytes.toString('utf8'), candidate, live)))
  return normalized
}

function payloadModes(entries: Record<string, number>): [string, number][] {
  return Object.entries(entries).filter(([path]) => path !== 'manifest.json.sig').sort(([earlier], [later]) => earlier.localeCompare(later))
}

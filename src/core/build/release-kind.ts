// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BuildRequest, JsonObject, ReleaseKind } from '../types.js'
import { sourcesFor } from './discovery.js'

export function releaseKind(value: string = 'live'): ReleaseKind {
  if (value === 'draft' || value === 'prerelease' || value === 'live') return value
  throw new Error(`invalid release kind: ${value}`)
}

export function assertReleaseVersion(version: string, kind: ReleaseKind): void {
  const candidate = version.endsWith('-pre')
  if (candidate !== (kind !== 'live')) throw new Error(`${kind} release requires ${kind === 'live' ? 'no' : 'a'} terminal -pre: ${version}`)
}

export function selectedAtoms(atoms: JsonObject[], selectedIds?: string[]): JsonObject[] {
  if (selectedIds === undefined) return atoms
  if (selectedIds.length === 0 || new Set(selectedIds).size !== selectedIds.length) throw new Error('selected unit IDs must be nonempty and unique')
  selectedIds.forEach((name) => {
    if (!atoms.some((atom) => atom.name === name)) throw new Error(`selected unit is missing: ${name}`)
  })
  return atoms.filter((atom) => selectedIds.includes(String(atom.name)))
}

export function validateSelectedVersions(request: BuildRequest): void {
  const manifests = sourcesFor(request).map((source) => source.manifest)
  const selected = selectedAtoms(manifests, request.selectedIds)
  if (request.releaseKind === undefined) return
  selected.forEach((manifest) => assertReleaseVersion(String(manifest.version), request.releaseKind!))
}

export function stampReleaseKinds(atoms: JsonObject[], request: BuildRequest): JsonObject[] {
  if (request.releaseKind === undefined) return atoms
  const selected = new Set(selectedAtoms(atoms, request.selectedIds).map((atom) => atom.name))
  return atoms.map((atom) => selected.has(atom.name) ? { ...atom, release_kind: request.releaseKind! } : atom)
}

export function atomFilename(atom: JsonObject): string {
  const suffix = atom.release_kind === undefined ? '' : `.${releaseKind(String(atom.release_kind))}`
  return `${String(atom.name)}${suffix}.atom.json`
}

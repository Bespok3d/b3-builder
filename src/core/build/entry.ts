// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { JsonObject, JsonValue } from '../types.js'
import { asArray, asBool, asObject, asString, copyIfPresent, fieldPresent } from './json.js'

// The generic catalog-entry helpers a plugin manifest is turned into a registry entry through: the
// service graph (requires/provides/deps), the shared base fields every entry carries, and the published
// atom. A published atom keeps its cross-plugin deps raw (`require`) for a later assembler and carries
// an injected doc_url/download_url. Flavors that resolve deps ahead of time or compute a disk-relative
// doc_url are caller-specific and live outside the generic core.

// `sw_version` is plugin-only: the upstream version a wrapper plugin packages (Fluidd, Mainsail,
// Tailscale...), distinct from the plugin's own `version`. A collection wraps no external software, so
// it never carries one.
const OPTIONAL_ENTRY_KEYS = ['icon', 'min_daemon_version', 'homepage', 'macros', 'config', 'sw_version']
const COLLECTION_ENTRY_KEYS = ['icon', 'homepage']
// `author` is the human/org display name behind the entry ("bespoked"), distinct from `publisher` (the
// signing-key fingerprint that PROVES the release): the two may name different parties. Every entry
// shape carries it, so it lives in the base fields both a plugin atom and a collection start from.
// `attributions` is the credits text the store shows for a plugin, carried on the entry itself so the
// store never has to download the .b3 to say whose work a plugin builds on.
const BASE_OPTIONAL_KEYS = ['author', 'attributions']

function serviceName(provided: JsonValue): string {
  return typeof provided === 'string' ? provided : asString(asObject(provided).service)
}

export function requiredServiceNames(manifest: JsonObject): string[] {
  return asArray(manifest.require).map((requirement) => asString(asObject(requirement).service))
}

export function providedServiceNames(manifest: JsonObject): string[] {
  return asArray(manifest.provides).map(serviceName)
}

// Every service a source set provides, first provider wins (a name-keyed map so a later duplicate
// provider never overrides the first, matching the legacy providerByService for both callers).
export function providerByService(sources: { name: string; provides: string[] }[]): Record<string, string> {
  const providers: Record<string, string> = {}
  sources.forEach((source) => {
    source.provides.forEach((service) => {
      if (!(service in providers)) providers[service] = source.name
    })
  })
  return providers
}

// The catalog `deps` are store plugin ids, derived from the service graph: a requirement resolves to
// whichever id provides that service (or the raw service name if nothing does).
export function resolveDeps(required: string[], providers: Record<string, string>): string[] {
  const resolved: string[] = []
  required.forEach((service) => {
    const providerId = providers[service] ?? service
    if (!resolved.includes(providerId)) resolved.push(providerId)
  })
  return resolved
}

export function atomKey(manifest: JsonObject): string {
  return `${asString(manifest.name)}@${asString(manifest.version)}`
}

export function latestUpdated(entries: JsonObject[]): string {
  return entries.reduce((latest, entry) => {
    const updatedAt = asString(entry.updated_at)
    return updatedAt > latest ? updatedAt : latest
  }, '')
}

// The catalog fields every entry carries regardless of shape: a plugin atom and a collection entry both
// start here. A plugin-only entry (requires/provides/conflicts/endpoints) and a collection-only entry
// (members) each add their own fields on top.
export function baseCatalogFields(manifest: JsonObject): JsonObject {
  const entry: JsonObject = {
    name: asString(manifest.name),
    title: asString(manifest.title),
    version: asString(manifest.version),
    description: asString(manifest.description),
    tagline: asString(manifest.tagline),
    category: asString(manifest.category),
    channel: asString(manifest.channel),
    publisher: asString(manifest.publisher),
    printer_specific: asBool(manifest.printer_specific, false),
    published_at: asString(manifest.published_at),
    updated_at: asString(manifest.updated_at),
  }
  copyIfPresent(entry, manifest, BASE_OPTIONAL_KEYS)
  applyLicenseUrl(entry, manifest)
  return entry
}

// Unlike the changelog, a licence file is never a release asset: it lives in the plugin's own repo and
// the store only ever links out to it. So the manifest carries the link and the entry passes it
// through, rather than a source-relative placeholder something downstream has to finalize.
export function applyLicenseUrl(entry: JsonObject, manifest: JsonObject): void {
  if (fieldPresent(manifest, 'license')) entry.license_url = asString(manifest.license)
}

export function applyChangelogUrl(entry: JsonObject, manifest: JsonObject): void {
  if (fieldPresent(manifest, 'changelog')) entry.changelog_url = `${asString(manifest.name)}/${asString(manifest.changelog)}`
}

export function sharedEntryFields(manifest: JsonObject): JsonObject {
  const entry = baseCatalogFields(manifest)
  entry.requires = { capabilities: asArray(asObject(manifest.requires).capabilities) }
  entry.provides = providedServiceNames(manifest)
  entry.conflicts = asArray(manifest.conflicts)
  copyIfPresent(entry, manifest, OPTIONAL_ENTRY_KEYS)
  applyChangelogUrl(entry, manifest)
  const endpoints = asArray(manifest.endpoints)
  if (endpoints.length > 0) entry.endpoints = endpoints
  return entry
}

export function buildAtomEntry(manifest: JsonObject, downloadUrl: string, docUrl: string): JsonObject {
  const entry = sharedEntryFields(manifest)
  entry.require = asArray(manifest.require)
  entry.doc_url = docUrl
  entry.download_url = downloadUrl
  return entry
}

export function isCollection(manifest: JsonObject): boolean {
  return asString(manifest.kind) === 'collection'
}

// A collection is install-orchestration metadata: it names member plugin ids plus version constraints,
// ships no files/ to pack and therefore no .b3, so it carries no download_url and none of the
// plugin-only catalog fields (requires/provides/conflicts/endpoints, and the payload-shaped
// min_daemon_version/macros/config). The atom keeps `kind` purely so the list assembler can route it
// into collections[]; the published entry drops it again.
export function buildCollectionAtom(manifest: JsonObject, docUrl: string): JsonObject {
  const entry = baseCatalogFields(manifest)
  entry.kind = 'collection'
  entry.members = asArray(manifest.members)
  entry.doc_url = docUrl
  copyIfPresent(entry, manifest, COLLECTION_ENTRY_KEYS)
  applyChangelogUrl(entry, manifest)
  return entry
}

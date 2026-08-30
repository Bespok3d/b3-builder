// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { basename } from 'node:path'
import type { JsonObject } from '../types.js'
import { asArray, asString } from './json.js'
import {
  buildAtomEntry,
  buildCollectionAtom,
  isCollection,
  latestUpdated,
  providerByService,
  requiredServiceNames,
  resolveDeps,
  serviceName,
} from './entry.js'
import type { PluginSource } from './plugin-source.js'
import type { ServiceProvider } from './service-providers.js'

const LIST_SCHEMA_VERSION = 1

// What the list says about itself. Three values that always travel together and are always the
// caller's, never a baked default.
export interface SubListIdentity {
  listName: string
  listPublisher: string
  listAuthor?: string
}

// Every plugin dir published as its own atom, the shape a federated registry hosts: doc_url points at
// the passed-in atomRepo (an owner/repo slug), download_url is the local .b3 filename (the real
// CI-injected release URL is a later Stage). The publisher/org identity in the doc_url is a parameter,
// never a baked default.
export function buildAtoms(sources: PluginSource[], atomRepo: string): JsonObject[] {
  return sources.map((source) => {
    const pluginId = basename(source.dir)
    const docUrl = `https://github.com/${atomRepo}/blob/main/${pluginId}/doc/README.md`
    if (isCollection(source.manifest)) return buildCollectionAtom(source.manifest, docUrl)
    const name = asString(source.manifest.name)
    const version = asString(source.manifest.version)
    return buildAtomEntry(source.manifest, `${name}-${version}.b3`, docUrl)
  })
}

// A repo's own published sub-list (index.json): assembles the atoms into the ADR-0012 federated-index
// shape. A plugin atom's raw `require` resolves into store-id `deps` from the atom set's own provider
// graph and is then dropped (only the assembler needs it). A collection atom has no require/deps: its
// members[] passes through verbatim and it sheds the `kind` that routed it here, because an entry's
// type IS the array it sits in (a plugin entry carries no kind:plugin either). A repo with no
// collection publishes no `collections` key at all, the shape every collection-free list already has.
// The list name, publisher, and optional author are passed in, never a baked default. A list omitting
// its author keeps the exact shape every author-free list already publishes.
export function assembleSubList(atoms: JsonObject[], identity: SubListIdentity, knownProviders: ServiceProvider[] = []): JsonObject {
  const sorted = [...atoms].sort((earlier, later) => asString(earlier.name).localeCompare(asString(later.name)))
  const pluginAtoms = sorted.filter((atom) => !isCollection(atom))
  const providers = providerByService([...providersInThisRepo(pluginAtoms), ...knownProviders])
  const plugins = pluginAtoms.map((atom) => {
    const { require: _require, ...entry } = atom
    return { ...entry, deps: resolveDeps(asString(atom.name), requiredServiceNames(atom), providers) }
  })
  const collections = sorted.filter(isCollection).map((atom) => {
    const { kind: _kind, ...entry } = atom
    return entry
  })
  return {
    schema_version: LIST_SCHEMA_VERSION,
    name: identity.listName,
    publisher: identity.listPublisher,
    ...(identity.listAuthor !== undefined ? { author: identity.listAuthor } : {}),
    updated: latestUpdated([...plugins, ...collections]),
    assembled_at: assemblyStamp(),
    plugins,
    ...(collections.length > 0 ? { collections } : {}),
    lists: [],
  }
}

function providersInThisRepo(pluginAtoms: JsonObject[]): ServiceProvider[] {
  return pluginAtoms.map((atom) => ({ name: asString(atom.name), provides: asArray(atom.provides).map(serviceName) }))
}

// `updated` answers "how new is the newest plugin in here", derived from the entries, so a list rebuilt
// today over untouched plugins still reads as months old and a reader cannot tell a fresh assembly from a
// stale file served by a dead workflow. `assembled_at` answers the other question: when the run that
// produced THIS file happened. Seconds, in UTC, because CI assembles a list many times in one day;
// milliseconds carry nothing a reader can use.
function assemblyStamp(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`
}

import { basename } from 'node:path'
import type { JsonObject } from '../types.js'
import { asArray, asString } from './json.js'
import { buildAtomEntry, latestUpdated, providerByService, requiredServiceNames, resolveDeps } from './entry.js'
import type { PluginSource } from './plugin-source.js'

const LIST_SCHEMA_VERSION = 1

// Every plugin dir published as its own atom, the shape a federated registry hosts: doc_url points at
// the passed-in atomRepo (an owner/repo slug), download_url is the local .b3 filename (the real
// CI-injected release URL is a later packet). The publisher/org identity in the doc_url is a parameter,
// never a baked default.
export function buildAtoms(sources: PluginSource[], atomRepo: string): JsonObject[] {
  return sources.map((source) => {
    const name = asString(source.manifest.name)
    const version = asString(source.manifest.version)
    const pluginId = basename(source.dir)
    const downloadUrl = `${name}-${version}.b3`
    const docUrl = `https://github.com/${atomRepo}/blob/main/${pluginId}/doc/README.md`
    return buildAtomEntry(source.manifest, downloadUrl, docUrl)
  })
}

// A repo's own published sub-list (index.json): assembles the per-plugin atoms into the ADR-0012
// federated-index shape, resolving each atom's raw `require` into store-id `deps` from the atom set's
// own provider graph, then dropping `require` (only the assembler needs it). The list name and
// publisher are passed in, never a baked default.
export function assembleSubList(atoms: JsonObject[], listName: string, listPublisher: string): JsonObject {
  const sorted = [...atoms].sort((earlier, later) => asString(earlier.name).localeCompare(asString(later.name)))
  const providers = providerByService(
    sorted.map((atom) => ({ name: asString(atom.name), provides: asArray(atom.provides).map((value) => asString(value)) })),
  )
  const plugins = sorted.map((atom) => {
    const { require: _require, ...entry } = atom
    return { ...entry, deps: resolveDeps(requiredServiceNames(atom), providers) }
  })
  return {
    schema_version: LIST_SCHEMA_VERSION,
    name: listName,
    publisher: listPublisher,
    updated: latestUpdated(plugins),
    plugins,
    lists: [],
  }
}

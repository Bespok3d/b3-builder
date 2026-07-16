// The types the one build core is shaped around. The plugin manifest, the registry atom, and the
// assembled sub-list are external JSON documents whose schema is owned elsewhere (ADR-0010 the .b3
// format, ADR-0012 the federated registry), so they are modeled here as opaque JSON, never
// re-declared: a second copy of the manifest schema would be a second source of truth to drift.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

// What a publisher build turns into a .b3 set: ONE plugin dir (a dir holding a manifest.json), or a
// repo of plugin dirs (each immediate subdir holding a manifest.json). A plugin build produces one
// .b3 plus its atom; a repo build produces one per dir, and assembles them into one leaf sub-list when
// the request carries a list identity.
export type BuildUnit = 'plugin' | 'repo'

// Publisher/org identity, always passed IN, never baked into the tool. `atomRepo` is the owner/repo
// slug each atom's doc_url points at. A repo build that publishes its own sub-list additionally names
// it, so an external publisher's list carries their identity, not a hardcoded default; a repo whose
// atoms register into someone else's list passes the atom identity alone.
export interface AtomIdentity {
  atomRepo: string
}

export interface ListIdentity extends AtomIdentity {
  listName: string
  listPublisher: string
}

export function isListIdentity(identity: AtomIdentity | ListIdentity): identity is ListIdentity {
  return 'listName' in identity
}

// A single-plugin build: one dir to one .b3 + atom, with only the atom identity. `bake` opts into
// producing the payload from source (R1); off means the tree is already baked (see steps/bake.ts).
export interface PluginBuildRequest {
  unit: 'plugin'
  sourceDir: string
  outputDir: string
  identity: AtomIdentity
  skipUnchanged?: boolean
  bake?: boolean
}

// A repo-of-dirs build: every plugin dir to its .b3 + atom. A list identity additionally assembles the
// atoms into one sub-list; the atom identity alone builds atoms only, for a repo whose atoms register
// into a list it does not own. `exclude` names immediate subdirs discovery skips entirely (they never
// build, pack, atom, or enter the sub-list): caller-supplied curation for a dir that holds a
// manifest.json but must not publish (a dev-only UI variant like fluidd-bleeding-edge). The core stays
// ignorant of WHY a dir is excluded, the same way it is ignorant of who the publisher is: curation is a
// passed-in parameter, never a bundle/variant concept baked into the tool (ADR-0041).
export interface RepoBuildRequest {
  unit: 'repo'
  sourceDir: string
  outputDir: string
  identity: AtomIdentity | ListIdentity
  exclude?: string[]
  skipUnchanged?: boolean
  bake?: boolean
}

export type BuildRequest = PluginBuildRequest | RepoBuildRequest

// One packed .b3 written to the output dir: its filename (`<name>-<version>.b3`) and absolute path.
// `skipped` is true when skip-unchanged reused an existing .b3 (its fingerprint was unchanged) instead
// of repacking; false on a fresh pack; undefined when skip-unchanged was off.
export interface PackedPackage {
  filename: string
  path: string
  skipped?: boolean
}

export interface BuildArtifacts {
  packages: PackedPackage[]
  // The per-plugin atoms (one per packed plugin).
  atoms: JsonObject[]
  // The assembled leaf sub-list for a repo build with a list identity; null for a single-plugin build
  // or an atoms-only repo build.
  subList: JsonObject | null
}

// Threaded through the ordered steps as each one fills in its part. `subList` stays null until the
// registry step runs (and stays null for a single-plugin build or an atoms-only repo build, neither of
// which has a sub-list).
export interface PipelineContext {
  request: BuildRequest
  packages: PackedPackage[]
  atoms: JsonObject[]
  subList: JsonObject | null
}

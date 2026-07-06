// The types the one build core is shaped around. The plugin manifest, the registry index, and the
// per-plugin atom are external JSON documents whose schema is owned elsewhere (ADR-0010 the .b3
// format, ADR-0012 the federated registry), so they are modeled here as opaque JSON, never
// re-declared: a second copy of the manifest schema would be a second source of truth to drift.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

// A monorepo build packs the opt-in bundle into ONE bundled index (the app loads it from disk); a
// co-repo build packs each plugin into its own atom plus a leaf sub-list the main index references.
// Both run the SAME pipeline over the SAME core; only the registry step branches on the kind.
export type BuildKind = 'monorepo-bundle' | 'co-repo'

// A monorepo build bundles the release opt-in list (release) or additionally the dev-only list and
// channel variants (dev). Meaningful only for kind 'monorepo-bundle'.
export type BundleChannel = 'release' | 'dev'

export interface BuildRequest {
  kind: BuildKind
  sourceRoot: string
  outputDir: string
  channel?: BundleChannel
}

// One packed .b3 written to the output dir: its filename (`<name>-<version>.b3`) and absolute path.
export interface PackedPackage {
  filename: string
  path: string
}

export interface BuildArtifacts {
  packages: PackedPackage[]
  // The bundled index (monorepo-bundle) or the co-repo sub-list (co-repo).
  index: JsonObject
  // The per-plugin atoms (co-repo); empty for a monorepo-bundle build.
  atoms: JsonObject[]
}

// Threaded through the ordered steps as each one fills in its part. `index` is null until the
// registry step runs; runPipeline refuses to return an artifact set whose index never materialized.
export interface PipelineContext {
  request: BuildRequest
  packages: PackedPackage[]
  index: JsonObject | null
  atoms: JsonObject[]
}

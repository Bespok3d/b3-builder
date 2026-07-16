// The importable surface of the build system. The CLI, the GitHub Action, and any downstream TARGET
// that consumes the build system as a library (the app dev tools, later) import from here and nothing
// deeper. Keeping the public surface to this one barrel is what lets those consumers depend on the core
// without reaching into its internals.
export { runPipeline } from './pipeline.js'
export { publisherRequest } from './request.js'
export { NotPortedError, describeError } from './errors.js'
export { packIfChanged } from './build/skip-unchanged.js'
export { builderVersion } from './version.js'
// The class-aware refuse-to-pack gate (R2) and the bake dispatcher (R1), exported so the app's bundle
// glue (a library consumer that packs via packIfChanged, not the full pipeline) enforces the same "was it
// baked?" invariant the pipeline's gate step does: it bakes a not-yet-baked payload then asserts.
export { assertBaked, bakedGaps } from './bake/assert-baked.js'
export { bakePlugin } from './bake/dispatch.js'
// The canonical catalog-entry primitives. An external index assembler that cannot import this built
// dist on its own pure path (the app bundler, whose test-time buildIndex loads without the sibling repo
// built) mirrors these and guards its copies against them with a cross-boundary drift test, per the
// single-source-of-truth rule for an unavoidable mirror.
export { sharedEntryFields, atomKey, latestUpdated, isCollection } from './build/entry.js'
export type { RawBuildInputs } from './request.js'
export type {
  AtomIdentity,
  BuildArtifacts,
  BuildRequest,
  BuildUnit,
  JsonObject,
  JsonValue,
  ListIdentity,
  PackedPackage,
  PipelineContext,
  PluginBuildRequest,
  RepoBuildRequest,
} from './types.js'

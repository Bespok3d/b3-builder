// The importable surface of the build system. The CLI, the GitHub Action, and any downstream TARGET
// that consumes the build system as a library (the app dev tools, later) import from here and nothing
// deeper. Keeping the public surface to this one barrel is what lets those consumers depend on the
// core without reaching into its internals.
export { runPipeline } from './pipeline.js'
export { coerceKind, coerceChannel } from './request.js'
export { NotPortedError, describeError } from './errors.js'
export type {
  BuildArtifacts,
  BuildKind,
  BuildRequest,
  BundleChannel,
  JsonObject,
  JsonValue,
  PackedPackage,
  PipelineContext,
} from './types.js'

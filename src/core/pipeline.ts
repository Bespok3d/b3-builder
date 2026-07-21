import type { BuildArtifacts, BuildRequest, JsonObject, PipelineContext } from './types.js'
import { isListIdentity } from './types.js'
import { signingKeyFingerprint } from './build/sign-bytes.js'
import { bake } from './steps/bake.js'
import { pack } from './steps/pack.js'
import { buildRegistry } from './steps/index.js'
import { gate } from './steps/gate.js'

// The one build pipeline every publisher face runs (the CLI, the reusable GitHub Action, and one day
// the app dev tools), in a fixed GPG-aware order: bake the per-class payload, pack the .b3 set (signing
// each manifest in place when the request carries a signingKey, see steps/pack.ts), build the registry
// (each plugin's atom, plus a leaf sub-list for a repo of plugin dirs), then the class-aware gate. The
// order is written out explicitly, one await per step, so a reader sees the whole shape at once.
export async function runPipeline(request: BuildRequest): Promise<BuildArtifacts> {
  const publisher = request.signingKey === undefined ? undefined : await signingKeyFingerprint(request.signingKey)
  const initial: PipelineContext = { request, packages: [], atoms: [], subList: null, publisher }
  const baked = await bake(initial)
  const packed = await pack(baked)
  const registered = await buildRegistry(packed)
  const gated = await gate(registered)
  return { packages: gated.packages, atoms: gated.atoms, subList: requireSubListForRepo(gated) }
}

// A repo build carrying a list identity must have produced its assembled sub-list; a null there means
// the registry step was skipped or misordered. A single-plugin build and an atoms-only repo build
// legitimately have none.
function requireSubListForRepo(context: PipelineContext): JsonObject | null {
  if (context.request.unit === 'repo' && isListIdentity(context.request.identity) && context.subList === null) {
    throw new Error('pipeline finished a repo build without a sub-list (the registry step did not run)')
  }
  return context.subList
}

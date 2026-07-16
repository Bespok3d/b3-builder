import type { BuildArtifacts, BuildRequest, JsonObject, PipelineContext } from './types.js'
import { isListIdentity } from './types.js'
import { bake } from './steps/bake.js'
import { pack } from './steps/pack.js'
import { buildRegistry } from './steps/index.js'
import { sign } from './steps/sign.js'
import { gate } from './steps/gate.js'

// The one build pipeline every publisher face runs (the CLI, the reusable GitHub Action, and one day
// the app dev tools), in a fixed GPG-aware order: bake the per-class payload, pack the .b3 set, build
// the registry (each plugin's atom, plus a leaf sub-list for a repo of plugin dirs), sign, then the
// class-aware gate. The sign step is a deliberate seam that is a no-op until R4; every other step is
// where a later packet lands its real behavior (see each step file). The order is written out
// explicitly, one await per step, so a reader sees the whole shape at once.
export async function runPipeline(request: BuildRequest): Promise<BuildArtifacts> {
  const initial: PipelineContext = { request, packages: [], atoms: [], subList: null }
  const baked = await bake(initial)
  const packed = await pack(baked)
  const registered = await buildRegistry(packed)
  const signed = await sign(registered)
  const gated = await gate(signed)
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

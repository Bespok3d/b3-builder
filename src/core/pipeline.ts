import type { BuildArtifacts, BuildRequest, JsonObject, PipelineContext } from './types.js'
import { bake } from './steps/bake.js'
import { pack } from './steps/pack.js'
import { buildRegistry } from './steps/index.js'
import { sign } from './steps/sign.js'
import { gate } from './steps/gate.js'

// The one build pipeline every face runs (the CLI, the reusable GitHub Action, and one day the app
// dev tools), in a fixed GPG-aware order: bake the per-class payload, pack the .b3 set, build the
// registry (a bundled index for a monorepo build; per-plugin atoms plus a leaf sub-list for a
// co-repo), sign, then the class-aware gate. The sign step is a deliberate seam that is a no-op until
// R4; every other step is where a later packet lands its real behavior (see each step file). The
// order is written out explicitly, one await per step, so a reader sees the whole shape at once.
export async function runPipeline(request: BuildRequest): Promise<BuildArtifacts> {
  const initial: PipelineContext = { request, packages: [], index: null, atoms: [] }
  const baked = await bake(initial)
  const packed = await pack(baked)
  const registered = await buildRegistry(packed)
  const signed = await sign(registered)
  const gated = await gate(signed)
  return { packages: gated.packages, index: requireIndex(gated), atoms: gated.atoms }
}

// The registry step must have produced an index; a null here means a step was skipped or reordered
// wrongly. Fail loudly rather than hand back an artifact set with a missing index.
function requireIndex(context: PipelineContext): JsonObject {
  if (context.index === null) {
    throw new Error('pipeline finished without a registry index (the index step did not run)')
  }
  return context.index
}

import type { PipelineContext } from '../types.js'
import { sourcesFor } from '../build/discovery.js'
import { assertBaked } from '../bake/assert-baked.js'

// Step 4 of 4: the one class-aware refuse-to-pack gate (R2). Owner: packet 6.
//
// For every discovered plugin source, assert every payload its manifest DECLARES was baked (the logic and
// the per-class rules live in bake/assert-baked.ts): class 2 off the requirements files, classes 3 to 6
// off the manifest `bake` field. A binary-only plugin declares nothing to bake and passes clean. The gate
// checks OUTPUT EXISTENCE, not whether a bake ran, so an out-of-band bake and a --bake build both pass;
// only a genuinely unbaked plugin fails the build. It generalizes pack-plugins.sh's ensure_baked /
// check_baked_deps / check_baked_kmodule, which understood only class 2 (and the kmodule placement).
//
// Position: LAST, so a pipeline consumer (the CLI, the Action) never publishes an unbaked .b3. The check
// only inspects the source tree, so the app's bundle glue (app-bundle.mjs, a library consumer that packs
// via packIfChanged, not this pipeline) calls the same assertBaked BEFORE it packs; between the two, no
// path can ship an unbaked payload.
export async function gate(context: PipelineContext): Promise<PipelineContext> {
  const { request } = context
  sourcesFor(request).forEach(assertBaked)
  return context
}

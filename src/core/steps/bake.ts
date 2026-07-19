import type { PipelineContext } from '../types.js'
import { sourcesFor } from '../build/discovery.js'
import { bakePlugin } from '../bake/dispatch.js'

// Step 1 of 4: bake each plugin whose payload is a build output of its class (R1). Owner: packet 5.
//
// The dispatcher (bake/dispatch.ts) runs the right baker for all five shapes: the presence-driven Python
// bake (ADR-0036) plus the manifest's declared bake steps (go, download, docker-c, docker-ko). It absorbs
// the per-plugin build.sh zoo and models the kernel-build axis (vermagic / kernel_release) distinctly
// from the arch tuple.
//
// Baking is an OPT-IN mode (request.bake), like skip-unchanged: a real publisher / CI build turns it on
// to produce payloads from source, while a build over an ALREADY-baked tree (the golden-equivalence
// rail, and any caller that baked out-of-band) leaves it off and this step is an honest passthrough. A
// plugin that declares no bake step is a passthrough even with baking on (there is nothing to build). The
// injectable runner lives in the dispatcher; the pipeline's own bake uses the real one.
export async function bake(context: PipelineContext): Promise<PipelineContext> {
  if (context.request.bake !== true) return context
  const { request } = context
  sourcesFor(request).forEach((source) => bakePlugin(source))
  return context
}

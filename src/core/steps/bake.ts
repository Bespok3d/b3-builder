import type { PipelineContext } from '../types.js'

// Step 1 of 5: bake each plugin whose payload is a build output of its class (R1). Owner: packet 3.
//
// The dispatcher will run the right baker for all five shapes (pip-download, go-build,
// sha-pinned-download, docker-C, docker-ko), keyed off a declarative manifest field, and model the
// kernel-build axis (vermagic / kernel_release) distinctly from the arch tuple. It absorbs the
// per-plugin build.sh zoo.
//
// Until packet 3 lands, sources reach the pipeline already baked (the build.sh zoo still runs
// out-of-band), so this step is an honest passthrough, not a stub that hides missing work: packet 2
// ports pack + index against an already-baked tree, and the bake dispatch arrives after.
export async function bake(context: PipelineContext): Promise<PipelineContext> {
  return context
}

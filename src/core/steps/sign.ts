import type { PipelineContext } from '../types.js'

// Step 4 of 5: GPG-sign the packed .b3 set and the registry index (R4). Owner: packet 10 (LAST; may
// spin into its own TRUST relay).
//
// This step is the reason signing is part of the ONE pipeline from day one instead of bolted on
// later: the seam exists so R4 slots straight in (make the signature real, and the app's
// verifyIndexSignature stops being a no-op) without reshaping the pipeline around it.
//
// Today it is a genuine, honest no-op: signing is decorative until the TRUST perimeter lands, so this
// step legitimately produces nothing and returns the context unchanged. It is the ONLY step allowed
// to do so; every other unfinished step throws rather than pass an empty result through.
export async function sign(context: PipelineContext): Promise<PipelineContext> {
  return context
}

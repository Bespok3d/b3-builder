import type { PipelineContext } from '../types.js'
import { NotPortedError } from '../errors.js'

// Step 3 of 5: turn the packed set into its registry form. Owner: packet 2.
//
// This is the ONE place the two forked index generators collapse into: port generate-index.mjs (the
// monorepo bundled index, with doc staging and the dev build-tag semantics) AND dedupe the co-repo
// generate-atom.mjs + assemble-list.mjs (the per-plugin atom plus the leaf sub-list) into it. It
// branches on request.kind: a monorepo-bundle fills context.index with the bundled index and leaves
// atoms empty; a co-repo fills context.atoms with the per-plugin atoms and context.index with the
// sub-list.
//
// It throws until then so the harness is honestly red rather than emitting an empty index.
export async function buildRegistry(_context: PipelineContext): Promise<PipelineContext> {
  throw new NotPortedError('index', 'packet 2 (unify generate-index + generate-atom + assemble-list)')
}

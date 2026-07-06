import type { PipelineContext } from '../types.js'
import { NotPortedError } from '../errors.js'

// Step 2 of 5: pack each discovered plugin into a .b3. Owner: packet 2.
//
// Port pack-plugins.sh's pack path into here: build_files_array (LC_ALL=C sorted, the root Python-dep
// declarations included, modes normalized to 644 or 755), the checksummed manifest injection, the zip
// (files/ + doc/ + the dep declarations + the manifest), and the content-hash / auto-bump / prune /
// bundle / channel-variant semantics EXACTLY. It fills context.packages with the produced .b3 set.
//
// It throws until then so the golden-equivalence harness is honestly red: the scaffold never packs an
// empty archive that would read as a passing build.
export async function pack(_context: PipelineContext): Promise<PipelineContext> {
  throw new NotPortedError('pack', 'packet 2 (extract the core: port pack-plugins.sh)')
}

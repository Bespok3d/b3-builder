import type { PipelineContext } from '../types.js'

// Step 5 of 5: the one class-aware refuse-to-pack gate (R2). Owner: packet 4.
//
// Generalize pack-plugins.sh's ensure_baked / check_baked_deps / check_baked_kmodule so EVERY
// artifact class's "was it baked?" is enforced centrally here, not per-plugin build.sh or per-repo
// CI; a python-less binary-only plugin is VALID; the daemon's test_plugin_packaging invariant is
// rehomed here (kept green); R6 (CI-time-only baking) is enforced uniformly.
//
// SHAPE NOTE for packet 4: the requirement names this the refuse-to-PACK gate, yet the pipeline runs
// it LAST (bake -> pack -> index -> sign -> gate), so today it is positioned as a final class-aware
// verification that FAILS the build (nothing ships) when a payload was not baked. pack-plugins.sh
// enforces the same invariant BEFORE it zips. Packet 4 decides whether to keep the check here as a
// post-pack build-failing gate or also assert pre-pack; either way the invariant is what matters.
//
// Passthrough until packet 4 (packet 1 does not yet gate anything).
export async function gate(context: PipelineContext): Promise<PipelineContext> {
  return context
}

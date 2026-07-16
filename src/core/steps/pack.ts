import type { BuildRequest, PackedPackage, PipelineContext } from '../types.js'
import { packPlugin } from '../build/archive.js'
import { sourcesFor } from '../build/discovery.js'
import { isCollection } from '../build/entry.js'
import { packIfChanged } from '../build/skip-unchanged.js'
import { builderVersion } from '../version.js'
import type { PluginSource } from '../build/plugin-source.js'

// Step 2 of 5: pack each discovered plugin dir into a .b3 over the shared archive.packPlugin. A normal
// build always repacks; an opt-in skip-unchanged build reuses an existing .b3 whose fingerprint is
// unchanged (see build/skip-unchanged.ts), so a caller iterating a large plugin set repacks only what
// actually changed. Pruning stale .b3 across repeated invocations is a caller concern this
// per-invocation core does not own.
//
// A kind:collection source is discovered like any other but has no payload to archive (it is pure
// install-orchestration metadata that reaches the device only through the index), so it is passed over
// here and here only. Skipping it is what the legacy pack.sh did too.
export async function pack(context: PipelineContext): Promise<PipelineContext> {
  const { request } = context
  const sources = sourcesFor(request).filter((source) => !isCollection(source.manifest))
  const version = request.skipUnchanged === true ? builderVersion() : ''
  const packages = sources.map((source) => packSource(source, request, version))
  return { ...context, packages }
}

function packSource(source: PluginSource, request: BuildRequest, version: string): PackedPackage {
  if (request.skipUnchanged === true) return packIfChanged(source.manifest, source.dir, request.outputDir, version)
  return packPlugin(source.manifest, source.dir, request.outputDir)
}

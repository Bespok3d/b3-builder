// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BuildRequest, PackedPackage, PipelineContext } from '../types.js'
import { packPlugin, signManifestInPlace, stampManifestPublisherInPlace } from '../build/archive.js'
import { sourcesFor } from '../build/discovery.js'
import { isCollection } from '../build/entry.js'
import { packIfChanged } from '../build/skip-unchanged.js'
import { refuseUnprovenPublisherClaims } from '../build/publisher-claim.js'
import { builderVersion } from '../version.js'
import type { PluginSource } from '../build/plugin-source.js'

// Step 2 of 4: pack each discovered plugin dir into a .b3 over the shared archive.packPlugin. A normal
// build always repacks; an opt-in skip-unchanged build reuses an existing .b3 whose fingerprint is
// unchanged (see build/skip-unchanged.ts), so a caller iterating a large plugin set repacks only what
// actually changed. Pruning stale .b3 across repeated invocations is a caller concern this
// per-invocation core does not own. A signingKey on the request stamps each packed .b3's manifest with
// that key's own fingerprint as its publisher and then signs the manifest in place (see
// archive.stampManifestPublisherInPlace, which the signature must cover, and archive.signManifestInPlace),
// so a shipped package names the identity that really signed it instead of the placeholder its source
// repo checked in; no signingKey packs unsigned and unstamped, same as before, EXCEPT that a manifest which
// hand-declares a real key fingerprint is refused outright rather than packed with an unbacked claim (see
// build/publisher-claim.ts).
//
// A kind:collection source is discovered like any other but has no payload to archive (it is pure
// install-orchestration metadata that reaches the device only through the index), so it is passed over
// here and here only. Skipping it is what the legacy pack.sh did too.
export async function pack(context: PipelineContext): Promise<PipelineContext> {
  const { request, publisher } = context
  const sources = sourcesFor(request).filter((source) => !isCollection(source.manifest))
  refuseUnprovenPublisherClaims(sources, request.signingKey)
  const version = request.skipUnchanged === true ? builderVersion() : ''
  const packages = await Promise.all(sources.map((source) => packSource(source, request, version, publisher)))
  return { ...context, packages }
}

async function packSource(
  source: PluginSource,
  request: BuildRequest,
  version: string,
  publisher: string | undefined,
): Promise<PackedPackage> {
  const packed =
    request.skipUnchanged === true
      ? packIfChanged(source.manifest, source.dir, request.outputDir, version)
      : packPlugin(source.manifest, source.dir, request.outputDir)
  if (request.signingKey === undefined || publisher === undefined) return packed
  stampManifestPublisherInPlace(packed.path, publisher)
  await signManifestInPlace(packed.path, request.signingKey)
  return packed
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPipeline } from '../core/pipeline.js'
import { isListIdentity } from '../core/types.js'
import { publicHalfOfSigningKey } from '../core/build/sign-bytes.js'
import { atomFilename } from '../core/build/release-kind.js'
import { actionIdentity, actionRequest } from './release-inputs.js'
import { prepareEvidence, verifyEvidence } from './release-evidence.js'
import { githubReleaseHost } from './github-release.js'
import { releaseTag, releaseMarker } from './publish-units.js'
import { readLiveBaseline } from './published-baseline.js'
import { publishRelease } from './publish-release.js'

async function main(phase: string | undefined, env: NodeJS.ProcessEnv): Promise<void> {
  const request = actionRequest(env)
  const identity = actionIdentity(env)
  const listBuild = isListIdentity(request.identity) && request.releaseKind === 'live'
  if (phase === 'prepare') {
    const baseline = listBuild ? await readLiveBaseline(request.identity.atomRepo, await publicHalfOfSigningKey(request.signingKey ?? ''), env.B3D_ALLOW_EMPTY_BASELINE === 'true') : undefined
    const artifacts = await runPipeline(request)
    await prepareEvidence(request, artifacts.atoms, identity, baseline?.index, baseline?.digest)
    return
  }
  if (phase !== 'publish') throw new Error('phase must be prepare or publish')
  const evidence = await verifyEvidence(request, identity)
  if (listBuild) {
    const ownReleases = Object.fromEntries(evidence.units.map((unit) => [releaseTag(unit), releaseMarker(evidence, unit)]))
    const baseline = await readLiveBaseline(request.identity.atomRepo, await publicHalfOfSigningKey(request.signingKey ?? ''), env.B3D_ALLOW_EMPTY_BASELINE === 'true', ownReleases)
    if (baseline.digest !== evidence.baselineDigest) throw new Error('Live list changed after preparation; prepare against current baseline')
  }
  const host = githubReleaseHost(request.identity.atomRepo)
  const isPrivate = JSON.parse(execFileSync('gh', ['api', `repos/${request.identity.atomRepo}`, '--jq', '.private'], { encoding: 'utf8' })) as boolean
  const atoms = await publishRelease(evidence, request.releaseKind ?? 'live', request.outputDir, isPrivate ? 'private' : 'public', host, request.signingKey)
  const registrationDir = join(request.outputDir, 'registration')
  mkdirSync(registrationDir, { recursive: true })
  atoms.forEach((atom) => writeFileSync(join(registrationDir, atomFilename(atom)), `${JSON.stringify(atom, null, 2)}\n`))
}

main(process.argv[2], process.env).catch((error: unknown) => {
  process.stderr.write(`release failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

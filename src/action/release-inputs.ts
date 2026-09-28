// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { requestFromArgs } from '../cli/build-request.js'
import type { BuildRequest } from '../core/types.js'
import type { ReleaseIdentity } from './release-evidence.js'
import { sourcesFor } from '../core/build/discovery.js'

export function actionRequest(env: NodeJS.ProcessEnv): BuildRequest {
  const args = ['--source', required(env, 'B3D_SOURCE'), '--out', required(env, 'B3D_OUT'), '--unit', required(env, 'B3D_UNIT'), '--atom-repo', required(env, 'B3D_ATOM_REPO')]
  const single = { 'list-name': env.B3D_LIST_NAME, 'list-publisher': env.B3D_LIST_PUBLISHER, 'release-kind': env.B3D_RELEASE_KIND }
  Object.entries(single).forEach(([flag, value]) => { if (value) args.push(`--${flag}`, value) })
  const repeated = { select: env.B3D_SELECTED_IDS, exclude: env.B3D_EXCLUDE_DIRS, providers: env.B3D_PROVIDER_INDEXES }
  Object.entries(repeated).forEach(([flag, values]) => { words(values).forEach((value) => args.push(`--${flag}`, value)) })
  if (env.B3D_SKIP_UNCHANGED === 'true') args.push('--skip-unchanged')
  if (env.B3D_BAKE === 'true') args.push('--bake')
  const request = requestFromArgs(args, env)
  if (!request.selectedIds?.length && env.GITHUB_REF_TYPE === 'tag') {
    const tag = required(env, 'GITHUB_REF_NAME')
    const matching = sourcesFor(request).filter((source) => tag.endsWith(`${source.manifest.name}-v${source.manifest.version}`))
    if (matching.length !== 1) throw new Error(`tag does not select exactly one plugin and version: ${tag}`)
    const inferredKind = String(matching[0]!.manifest.version).endsWith('-pre') ? 'draft' : 'live'
    return { ...request, selectedIds: [String(matching[0]!.manifest.name)], releaseKind: env.B3D_RELEASE_KIND ? request.releaseKind : inferredKind }
  }
  if (env.B3D_RELEASE_KIND) return request
  const selected = sourcesFor(request).filter((source) => request.selectedIds?.includes(String(source.manifest.name)))
  return { ...request, releaseKind: selected.length && selected.every((source) => String(source.manifest.version).endsWith('-pre')) ? 'draft' : 'live' }
}

export function actionIdentity(env: NodeJS.ProcessEnv): ReleaseIdentity {
  const builderCommit = required(env, 'B3D_BUILDER_COMMIT')
  return { sourceCommit: required(env, 'GITHUB_SHA'), builderCommit, registerCommit: env.B3D_REGISTER_COMMIT || (env.B3D_LIST_NAME ? builderCommit : required(env, 'B3D_REGISTER_COMMIT')), requireSignature: env.B3D_REQUIRE_SIGNATURE === 'true', ...preparationIdentity(env) }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

function words(value: string | undefined): string[] { return value?.trim().split(/\s+/).filter(Boolean) ?? [] }

function preparationIdentity(env: NodeJS.ProcessEnv): Pick<ReleaseIdentity, 'releaseTag' | 'preparation'> {
  if (!env.B3D_RELEASE_TAG) return {}
  if (env.B3D_PUBLISH !== 'false') return { releaseTag: env.B3D_RELEASE_TAG }
  const runId = Number(required(env, 'GITHUB_RUN_ID'))
  const runAttempt = Number(required(env, 'GITHUB_RUN_ATTEMPT'))
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1) throw new Error('receipt requires a nonpublishing workflow dispatch identity')
  return { releaseTag: env.B3D_RELEASE_TAG, preparation: { tag: env.B3D_RELEASE_TAG, runId, runAttempt } }
}

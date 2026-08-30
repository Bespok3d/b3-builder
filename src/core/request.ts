// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AtomIdentity, BuildRequest, BuildUnit, ListIdentity } from './types.js'

// The core owns what a valid publisher build request is, so both faces (the CLI and the GitHub Action)
// normalize their raw string inputs through here rather than each casting on its own. Publisher/org
// identity has NO baked default: atomRepo is required for any build, and a repo build that publishes
// its own sub-list passes both the list name and the list publisher (pass neither to build atoms only).
// A missing identity is a loud error, never a silent fallback to some hardcoded org.
export interface RawBuildInputs {
  unit: BuildUnit
  sourceDir: string
  outputDir: string
  atomRepo: string | undefined
  listName?: string
  listPublisher?: string
  listAuthor?: string
  exclude: string[]
  providerSources: string[]
  skipUnchanged: boolean
  bake: boolean
  signingKey?: string
}

export function publisherRequest(inputs: RawBuildInputs): BuildRequest {
  const atomRepo = requireInput('atom-repo', inputs.atomRepo)
  if (inputs.unit === 'plugin') {
    return {
      unit: 'plugin',
      sourceDir: inputs.sourceDir,
      outputDir: inputs.outputDir,
      identity: { atomRepo },
      skipUnchanged: inputs.skipUnchanged,
      bake: inputs.bake,
      signingKey: presentValue(inputs.signingKey),
    }
  }
  return {
    unit: 'repo',
    sourceDir: inputs.sourceDir,
    outputDir: inputs.outputDir,
    identity: repoIdentity(atomRepo, inputs),
    exclude: inputs.exclude,
    providerSources: inputs.providerSources,
    skipUnchanged: inputs.skipUnchanged,
    bake: inputs.bake,
    signingKey: presentValue(inputs.signingKey),
  }
}

function repoIdentity(atomRepo: string, inputs: RawBuildInputs): AtomIdentity | ListIdentity {
  const listName = presentValue(inputs.listName)
  const listPublisher = presentValue(inputs.listPublisher)
  const listAuthor = presentValue(inputs.listAuthor)
  if (listName === undefined && listPublisher === undefined) {
    if (listAuthor !== undefined) {
      throw new Error('--list-author names a sub-list, so it needs --list-name and --list-publisher too')
    }
    return { atomRepo }
  }
  if (listName === undefined || listPublisher === undefined) {
    throw new Error(
      'a sub-list identity needs BOTH --list-name and --list-publisher (pass neither for an atoms-only repo build)',
    )
  }
  return { atomRepo, listName, listPublisher, ...(listAuthor !== undefined ? { listAuthor } : {}) }
}

function presentValue(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

function requireInput(label: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`missing required --${label} (publisher/org identity must be passed in, it has no baked default)`)
  }
  return value
}

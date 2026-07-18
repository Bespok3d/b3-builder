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
  exclude: string[]
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
    skipUnchanged: inputs.skipUnchanged,
    bake: inputs.bake,
    signingKey: presentValue(inputs.signingKey),
  }
}

function repoIdentity(atomRepo: string, inputs: RawBuildInputs): AtomIdentity | ListIdentity {
  const listName = presentValue(inputs.listName)
  const listPublisher = presentValue(inputs.listPublisher)
  if (listName === undefined && listPublisher === undefined) return { atomRepo }
  if (listName === undefined || listPublisher === undefined) {
    throw new Error(
      'a sub-list identity needs BOTH --list-name and --list-publisher (pass neither for an atoms-only repo build)',
    )
  }
  return { atomRepo, listName, listPublisher }
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

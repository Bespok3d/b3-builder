import type { BuildRequest, BuildUnit } from './types.js'

// The core owns what a valid publisher build request is, so both faces (the CLI and the GitHub Action)
// normalize their raw string inputs through here rather than each casting on its own. Publisher/org
// identity has NO baked default: atomRepo is required for any build, and a repo build additionally
// requires the sub-list name and publisher. A missing identity is a loud error, never a silent fallback
// to some hardcoded org.
export interface RawBuildInputs {
  unit: BuildUnit
  sourceDir: string
  outputDir: string
  atomRepo: string | undefined
  listName: string | undefined
  listPublisher: string | undefined
  exclude: string[]
  skipUnchanged: boolean
  bake: boolean
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
    }
  }
  return {
    unit: 'repo',
    sourceDir: inputs.sourceDir,
    outputDir: inputs.outputDir,
    identity: {
      atomRepo,
      listName: requireInput('list-name', inputs.listName),
      listPublisher: requireInput('list-publisher', inputs.listPublisher),
    },
    exclude: inputs.exclude,
    skipUnchanged: inputs.skipUnchanged,
    bake: inputs.bake,
  }
}

function requireInput(label: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`missing required --${label} (publisher/org identity must be passed in, it has no baked default)`)
  }
  return value
}

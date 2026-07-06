import { runPipeline, coerceKind, coerceChannel, describeError } from '../core/index.js'
import type { BuildRequest } from '../core/index.js'

// The reusable-GitHub-Action face over the SAME one core the CLI runs. A node action receives its
// declared inputs as INPUT_<NAME> env vars, so this reads them into a BuildRequest and runs the
// pipeline, reporting through the workflow-command channel (::notice:: / ::error::). Packet 1 wires
// the face; the pack and index steps are packet 2, so a real run fails loudly here too.
function input(name: string): string | undefined {
  return process.env[`INPUT_${name.toUpperCase()}`]
}

function requestFromInputs(): BuildRequest {
  return {
    kind: coerceKind(input('kind')),
    sourceRoot: input('source') ?? '.',
    outputDir: input('out') ?? 'dist',
    channel: coerceChannel(input('channel')),
  }
}

async function main(): Promise<void> {
  const request = requestFromInputs()
  const artifacts = await runPipeline(request)
  process.stdout.write(`::notice::b3-builder packed ${artifacts.packages.length} package(s)\n`)
}

main().catch((error: unknown) => {
  process.stdout.write(`::error::${describeError(error)}\n`)
  process.exit(1)
})

#!/usr/bin/env node
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { runPipeline, coerceKind, coerceChannel, describeError } from '../core/index.js'
import type { BuildRequest } from '../core/index.js'

// The `bespok3d build` CLI: a thin face over the one core. It parses the invocation into a
// BuildRequest and runs the pipeline, then reports what was produced. The pipeline's pack and index
// steps are not yet ported (packet 2), so a real invocation fails loudly here rather than shipping an
// empty .b3; that is the intended state of the scaffold.
const USAGE = 'usage: bespok3d build --kind <monorepo-bundle|co-repo> --source <dir> --out <dir> [--channel <release|dev>]'

function requestFromArgs(args: string[]): BuildRequest {
  const { values } = parseArgs({
    args,
    options: {
      kind: { type: 'string' },
      source: { type: 'string' },
      out: { type: 'string' },
      channel: { type: 'string' },
    },
    allowPositionals: false,
  })
  return {
    kind: coerceKind(values.kind),
    sourceRoot: values.source ?? process.cwd(),
    outputDir: values.out ?? join(process.cwd(), 'dist'),
    channel: coerceChannel(values.channel),
  }
}

async function main(argv: string[]): Promise<number> {
  if (argv[2] !== 'build') {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const request = requestFromArgs(argv.slice(3))
  const artifacts = await runPipeline(request)
  process.stdout.write(`Built ${artifacts.packages.length} package(s) into ${request.outputDir}\n`)
  return 0
}

main(process.argv).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`bespok3d build failed: ${describeError(error)}\n`)
    process.exit(1)
  },
)

#!/usr/bin/env node
import { describeError, runPipeline } from '../core/index.js'
import { requestFromArgs } from './build-request.js'

// The `b3-builder build` CLI: a thin face over the one publisher core. It parses the invocation into a
// BuildRequest (see build-request.ts) and runs the pipeline, then reports what was produced. Its unit is
// a plugin dir (build one .b3 + atom) or a repo of plugin dirs (a .b3 + atom each, plus one assembled
// sub-list when the repo publishes its own list); the unit is auto-detected from whether the source dir
// itself holds a manifest.json, or set explicitly with --unit. Publisher/org identity (--atom-repo, plus
// --list-name/--list-publisher for a repo that owns its sub-list; pass neither to build atoms only) is
// passed in, never baked. The signing key arrives in B3D_SIGNING_KEY, never as a flag.
const USAGE =
  'usage: b3-builder build --source <dir> --out <dir> --atom-repo <owner/repo> [--unit plugin|repo] [--list-name <name>] [--list-publisher <name>] [--exclude <dir>]... [--skip-unchanged] [--bake]   (to sign, set B3D_SIGNING_KEY to an armored private key)'

async function main(argv: string[]): Promise<number> {
  if (argv[2] !== 'build') {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const request = requestFromArgs(argv.slice(3), process.env)
  const artifacts = await runPipeline(request)
  process.stdout.write(`Built ${artifacts.packages.length} package(s) into ${request.outputDir}\n`)
  return 0
}

main(process.argv).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`b3-builder build failed: ${describeError(error)}\n`)
    process.exit(1)
  },
)

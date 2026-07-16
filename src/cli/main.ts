#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { describeError, publisherRequest, runPipeline } from '../core/index.js'
import type { BuildRequest, BuildUnit } from '../core/index.js'

// The `bespok3d build` CLI: a thin face over the one publisher core. It parses the invocation into a
// BuildRequest and runs the pipeline, then reports what was produced. Its unit is a plugin dir (build
// one .b3 + atom) or a repo of plugin dirs (a .b3 + atom each, plus one assembled sub-list); the unit is
// auto-detected from whether the source dir itself holds a manifest.json, or set explicitly with
// --unit. Publisher/org identity (--atom-repo, and --list-name/--list-publisher for a repo) is passed
// in, never baked.
const USAGE =
  'usage: bespok3d build --source <dir> --out <dir> --atom-repo <owner/repo> [--unit plugin|repo] [--list-name <name>] [--list-publisher <name>] [--exclude <dir>]... [--skip-unchanged] [--bake]'

function requestFromArgs(args: string[]): BuildRequest {
  const { values } = parseArgs({
    args,
    options: {
      unit: { type: 'string' },
      source: { type: 'string' },
      out: { type: 'string' },
      'atom-repo': { type: 'string' },
      'list-name': { type: 'string' },
      'list-publisher': { type: 'string' },
      exclude: { type: 'string', multiple: true },
      'skip-unchanged': { type: 'boolean' },
      bake: { type: 'boolean' },
    },
    allowPositionals: false,
  })
  const sourceDir = values.source ?? process.cwd()
  return publisherRequest({
    unit: coerceUnit(values.unit, sourceDir),
    sourceDir,
    outputDir: values.out ?? join(process.cwd(), 'dist'),
    atomRepo: values['atom-repo'],
    listName: values['list-name'],
    listPublisher: values['list-publisher'],
    exclude: values.exclude ?? [],
    skipUnchanged: values['skip-unchanged'] ?? false,
    bake: values.bake ?? false,
  })
}

// A source dir that itself holds a manifest.json is one plugin; otherwise it is a repo of plugin dirs.
// An explicit --unit wins.
function coerceUnit(rawUnit: string | undefined, sourceDir: string): BuildUnit {
  if (rawUnit === 'plugin' || rawUnit === 'repo') return rawUnit
  return existsSync(join(sourceDir, 'manifest.json')) ? 'plugin' : 'repo'
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

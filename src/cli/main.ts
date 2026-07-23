#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { describeError, runPipeline } from '../core/index.js'
import { requestFromArgs } from './build-request.js'
import { planInit } from './init.js'
import type { Ask } from './init.js'

// The `b3-builder` CLI: a thin face over the one publisher core. `build` parses the invocation into a
// BuildRequest (see build-request.ts) and runs the pipeline; `init` scaffolds a manifest or a list ref
// (see init.ts). The build unit is a plugin dir (one .b3 + atom) or a repo of plugin dirs (a .b3 + atom
// each, plus one assembled sub-list when the repo publishes its own list); it is auto-detected from
// whether the source dir holds a manifest.json, or set with --unit. Publisher/org identity (--atom-repo,
// plus --list-name/--list-publisher/--list-author for a repo that owns its sub-list; pass none to build
// atoms only) is passed in, never baked. To sign, name a key with --sign (a key file or a key id) or put
// the armored key in B3D_SIGNING_KEY; the key material never travels as a flag value (see signing-key.ts).
const USAGE = [
  'usage:',
  '  b3-builder build --source <dir> --out <dir> --atom-repo <owner/repo> [--unit plugin|repo]',
  '    [--list-name <name>] [--list-publisher <fingerprint>] [--list-author <name>] [--exclude <dir>]...',
  '    [--skip-unchanged] [--bake] [--sign <key-file|key-id>]   (or set B3D_SIGNING_KEY to an armored private key)',
  '  b3-builder init plugin|list   (scaffold a manifest.json or a list reference in the current directory)',
].join('\n')

async function runBuild(argv: string[]): Promise<number> {
  const request = requestFromArgs(argv.slice(3), process.env)
  const artifacts = await runPipeline(request)
  process.stdout.write(`Built ${artifacts.packages.length} package(s) into ${request.outputDir}\n`)
  return 0
}

async function runInit(argv: string[]): Promise<number> {
  const unit = argv[3]
  if (unit !== 'plugin' && unit !== 'list') {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  const plan = await planInit(unit, process.cwd(), readlineAsk(readline), today()).finally(() => readline.close())
  if (existsSync(plan.path)) {
    process.stderr.write(`refusing to overwrite existing ${plan.path}\n`)
    return 1
  }
  writeFileSync(plan.path, `${JSON.stringify(plan.document, null, 2)}\n`)
  process.stdout.write(`Wrote ${plan.path}\n`)
  return 0
}

function readlineAsk(readline: ReturnType<typeof createInterface>): Ask {
  return async function ask(field, fallback) {
    const shown = fallback === '' ? `${field}: ` : `${field} [${fallback}]: `
    const answer = (await readline.question(shown)).trim()
    return answer === '' ? fallback : answer
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main(argv: string[]): Promise<number> {
  if (argv[2] === 'build') return runBuild(argv)
  if (argv[2] === 'init') return runInit(argv)
  process.stderr.write(`${USAGE}\n`)
  return 2
}

main(process.argv).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`b3-builder failed: ${describeError(error)}\n`)
    process.exit(1)
  },
)

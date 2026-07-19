import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { publisherRequest } from '../core/index.js'
import type { BuildRequest, BuildUnit } from '../core/index.js'

// Turns a `b3-builder build` invocation into a BuildRequest. Split out of main.ts so it is importable
// without running the CLI, which is what lets the signing seam be tested instead of assumed.
// The signing key arrives in B3D_SIGNING_KEY, never as a flag. Two reasons, both hard: an ASCII-armored
// private key starts with `-----BEGIN`, and node's parseArgs rejects any option value starting with a
// dash ("argument is ambiguous"), so the flag form could never carry a real key; and an argv-borne
// private key is readable by every process on the machine through ps and /proc/<pid>/cmdline.
export const SIGNING_KEY_VAR = 'B3D_SIGNING_KEY'

export function requestFromArgs(args: string[], env: NodeJS.ProcessEnv): BuildRequest {
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
    signingKey: env[SIGNING_KEY_VAR],
  })
}

// A source dir that itself holds a manifest.json is one plugin; otherwise it is a repo of plugin dirs.
// An explicit --unit wins.
function coerceUnit(rawUnit: string | undefined, sourceDir: string): BuildUnit {
  if (rawUnit === 'plugin' || rawUnit === 'repo') return rawUnit
  return existsSync(join(sourceDir, 'manifest.json')) ? 'plugin' : 'repo'
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginSource } from '../build/plugin-source.js'
import { parseBakeSteps } from './manifest-bake.js'
import type { BakeStep } from './manifest-bake.js'
import { PYTHON_DEP_ARTIFACTS } from './python-deps.js'

// The one class-aware refuse-to-pack gate (R2): for a plugin source, assert every payload its manifest
// DECLARES was actually baked, so an unbaked payload can never be packed into a broken .b3 regardless of
// which repo the plugin lives in. Generalizes pack-plugins.sh's ensure_baked / check_baked_deps /
// check_baked_kmodule beyond Python to every class. Two callers run the same check: the pipeline's gate
// step (steps/gate.ts, over the discovered sources) and the app's bundle glue (app-bundle.mjs, a library
// consumer that packs via packIfChanged and so never runs the pipeline's own gate step). One invariant,
// every path.
//
// The gate checks OUTPUT EXISTENCE, never whether a bake ran in THIS build: a plugin baked out-of-band
// and a plugin baked via --bake both pass, only a genuinely unbaked one fails. The kernel axis (R3) stays
// out of scope here, as it must: the gate asserts a .ko VARIANT FILE exists (was baked), nothing about
// whether it loads (a vermagic string is not a gate, ADR-0039; the device exercise is the pilot's job).
// A binary-only plugin (class 1: config / text / patch, no Python deps, no bake step) declares nothing to
// bake, so it has no gap and packs clean.

// A produced-directory payload (the class-2 wheels / site-packages trees) counts as baked only when it
// exists AND holds at least one entry: an empty dir is the unbaked state, mirroring the shell gate's
// has_baked_artifacts (`find -mindepth 1 -print -quit`).
function dirHasContent(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0
}

function missingPath(pluginDir: string, relativePath: string, what: string): string[] {
  return existsSync(join(pluginDir, relativePath)) ? [] : [`${what} was not baked (${relativePath} is missing)`]
}

// Class 2 (ADR-0036), presence-driven: a root requirements declaration must have its baked payload dir
// populated. Generalizes check_baked_deps.
function pythonDepGaps(pluginDir: string): string[] {
  return PYTHON_DEP_ARTIFACTS
    .filter((artifact) => existsSync(join(pluginDir, artifact.declaration)) && !dirHasContent(join(pluginDir, artifact.payloadDir)))
    .map((artifact) => `${artifact.declaration} is declared but ${artifact.payloadDir} is empty (the printer never runs pip, so bake first)`)
}

// Classes 3 to 6, declaration-driven off the manifest `bake` field: each step's baked output must exist.
// A docker-ko plugin declares one step per vermagic variant, so iterating the steps generalizes
// check_baked_kmodule (which iterated the manifest's kernel-module placement variants).
function bakeStepGaps(step: BakeStep, pluginDir: string): string[] {
  switch (step.class) {
    case 'go':
      return missingPath(pluginDir, step.output, 'the go binary')
    case 'download':
      return step.fetch.flatMap((fetch) => fetch.members).flatMap((member) => missingPath(pluginDir, member.dest, 'a downloaded binary'))
    case 'docker-c':
      return step.members.flatMap((member) => missingPath(pluginDir, member.dest, `the ${member.path} artifact`))
    case 'docker-ko':
      return missingPath(pluginDir, step.variantDest, `the ${step.kernel.vermagic} kernel module`)
  }
}

// Every unbaked payload a plugin source declares, as human-readable gaps (empty means fully baked). A
// caller that wants a boolean asks for `.length`; assertBaked turns a non-empty list into a thrown
// refusal.
export function bakedGaps(source: PluginSource): string[] {
  const declaredSteps = parseBakeSteps(source.manifest)
  return [...pythonDepGaps(source.dir), ...declaredSteps.flatMap((step) => bakeStepGaps(step, source.dir))]
}

export function assertBaked(source: PluginSource): void {
  const gaps = bakedGaps(source)
  if (gaps.length === 0) return
  throw new Error(`refusing to pack ${source.name}: its payload was not baked\n${gaps.map((gap) => `  - ${gap}`).join('\n')}`)
}

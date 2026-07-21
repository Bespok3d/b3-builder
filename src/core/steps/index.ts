import { join } from 'node:path'
import type { JsonObject, PipelineContext } from '../types.js'
import { isListIdentity } from '../types.js'
import { assembleSubList, buildAtoms } from '../build/co-repo-index.js'
import { sourcesFor } from '../build/discovery.js'
import { asString } from '../build/json.js'
import { assertUniqueAtoms } from '../build/unique-atoms.js'
import { writeJsonFile } from '../build/write-json.js'

// Step 3 of 4: turn the packed set into its published registry form and write it to the output dir.
// Every discovered plugin dir becomes its own atom (`<name>.atom.json`); a repo build carrying a list
// identity additionally assembles the atoms into one leaf sub-list (`index.json`), while an atoms-only
// repo build (whose atoms register into a list it does not own) stops at the atoms. Both repo forms
// guard against two dirs colliding on one name@version. Publisher/org identity (the atom doc_url repo,
// the sub-list name and publisher) is taken from the request, never baked.
export async function buildRegistry(context: PipelineContext): Promise<PipelineContext> {
  const { request, publisher } = context
  const sources = sourcesFor(request)
  const atoms = publishedBy(buildAtoms(sources, request.identity.atomRepo), publisher)
  atoms.forEach((atom) => writeJsonFile(join(request.outputDir, `${asString(atom.name)}.atom.json`), atom))
  if (request.unit === 'plugin') return { ...context, atoms, subList: null }
  assertUniqueAtoms(sources)
  if (!isListIdentity(request.identity)) return { ...context, atoms, subList: null }
  const subList = assembleSubList(atoms, request.identity.listName, request.identity.listPublisher)
  writeJsonFile(join(request.outputDir, 'index.json'), subList)
  return { ...context, atoms, subList }
}

// A catalog entry's publisher names whoever signed the package it points at, so on a signed build it is
// the signing key's fingerprint (context.publisher) and never the placeholder a source manifest declares:
// a source repo cannot know which key will sign its release. An unsigned build has no identity to claim
// and leaves the declared value alone. The sub-list's OWN publisher field stays the caller's
// --list-publisher input, which is list curation the key says nothing about (ADR-0041).
function publishedBy(atoms: JsonObject[], publisher: string | undefined): JsonObject[] {
  if (publisher === undefined) return atoms
  return atoms.map((atom) => ({ ...atom, publisher }))
}

import { join } from 'node:path'
import type { PipelineContext } from '../types.js'
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
  const { request } = context
  const sources = sourcesFor(request)
  const atoms = buildAtoms(sources, request.identity.atomRepo)
  atoms.forEach((atom) => writeJsonFile(join(request.outputDir, `${asString(atom.name)}.atom.json`), atom))
  if (request.unit === 'plugin') return { ...context, atoms, subList: null }
  assertUniqueAtoms(sources)
  if (!isListIdentity(request.identity)) return { ...context, atoms, subList: null }
  const subList = assembleSubList(atoms, request.identity.listName, request.identity.listPublisher)
  writeJsonFile(join(request.outputDir, 'index.json'), subList)
  return { ...context, atoms, subList }
}

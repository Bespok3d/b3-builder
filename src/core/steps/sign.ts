import { readFileSync, writeFileSync } from 'node:fs'
import { signDetached } from '../build/sign-bytes.js'
import type { PipelineContext } from '../types.js'

// Step 4 of 5: GPG-sign each packed .b3 (ADR-0041: identity is an input, never baked). No
// signingKey on the request means no signing, same as an unsigned local build; the index and atoms
// are signed by a later packet, not this one.
export async function sign(context: PipelineContext): Promise<PipelineContext> {
  const { signingKey } = context.request
  if (signingKey === undefined) return context
  await Promise.all(context.packages.map((packedPackage) => signPackage(packedPackage.path, signingKey)))
  return context
}

async function signPackage(packagePath: string, signingKey: string): Promise<void> {
  const bytes = readFileSync(packagePath)
  const armoredSignature = await signDetached(bytes, signingKey)
  writeFileSync(`${packagePath}.sig`, armoredSignature)
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { rmSync, writeFileSync } from 'node:fs'
import type { JsonValue } from '../types.js'
import { signDetached } from './sign-bytes.js'
import { canonicalJsonBytes, writeJsonFile } from './write-json.js'

// A sub-list published beside a detached signature, the list-level half of what pack.ts does for a
// package. Without it a repo could sign every .b3 it ships and still hand the app an index whose
// publisher line nobody can check, which is the state the ten published sub-lists were in: the crypto
// existed and no code path ever reached it for a list.
//
// Two contract points, both learned from the index-of-lists assembler that already does this:
//
// Signing runs BEFORE the index is written, so a build with a bad or locked key fails leaving the
// previous published pair untouched, rather than replacing the index and then dying with a stale
// signature beside the new bytes.
//
// Placing a signature is a REPLACE, and a run with no key DELETES the one an earlier keyed run left.
// The two states the app distinguishes are "no signature" (missing proof, the list still loads at tier
// unknown) and "a signature that does not check out" (a hard refusal). A stale .sig left beside rebuilt
// bytes reads as the second, so an unsigned build that kept it would look like tampering.
export async function writeSignedIndexFile(
  indexPath: string,
  index: JsonValue,
  armoredPrivateKey: string | undefined,
): Promise<boolean> {
  const armoredSignature = await signatureOver(canonicalJsonBytes(index), armoredPrivateKey)
  writeJsonFile(indexPath, index)

  return placeIndexSignature(indexPath, armoredSignature)
}

async function signatureOver(canonicalBytes: string, armoredPrivateKey: string | undefined): Promise<string | null> {
  if (armoredPrivateKey === undefined) return null
  return signDetached(Buffer.from(canonicalBytes, 'utf8'), armoredPrivateKey)
}

function placeIndexSignature(indexPath: string, armoredSignature: string | null): boolean {
  const signaturePath = `${indexPath}.sig`
  if (armoredSignature === null) {
    rmSync(signaturePath, { force: true })

    return false
  }
  writeFileSync(signaturePath, armoredSignature)

  return true
}

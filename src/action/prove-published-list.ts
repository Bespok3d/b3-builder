// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { publicHalfOfSigningKey, signingKeyFingerprint, verifyDetached } from '../core/build/sign-bytes.js'
import { namesAPublisher } from '../core/build/publisher-claim.js'

// A published list names its publisher as a key fingerprint, and a name is a CLAIM. The detached signature
// beside it is the only proof of that claim, so a release that ships the claim with no proof, or with a
// proof over bytes it does not serve, hands every reader a list it can never rate above unknown. Both
// states really happened to the ten published sub-lists: first unsigned for weeks, then signed over the
// pre-CI bytes rather than the served ones. Neither turned a release run red. This is what turns them red,
// at the producer, before the list is committed.

export async function provePublishedList(
  publishedIndexPath: string,
  publisher: unknown,
  armoredPrivateKey: string | undefined,
): Promise<void> {
  if (!namesAPublisher(publisher)) return
  if (armoredPrivateKey === undefined) {
    throw new Error(
      `${publishedIndexPath} names ${publisher} as its publisher and this run holds no signing key, so the list ` +
        'would publish with nothing backing that name. Give the run the signing key, or publish a list that names no publisher.',
    )
  }
  await assertTheSignerIsThePublisher(publishedIndexPath, publisher, armoredPrivateKey)
  await assertTheSignatureCoversTheServedBytes(publishedIndexPath, armoredPrivateKey)
}

async function assertTheSignerIsThePublisher(
  publishedIndexPath: string,
  publisher: string,
  armoredPrivateKey: string,
): Promise<void> {
  const signer = await signingKeyFingerprint(armoredPrivateKey)
  if (signer.toLowerCase() === publisher.toLowerCase()) return

  throw new Error(
    `${publishedIndexPath} names ${publisher} as its publisher but the run signed it with ${signer}. A reader ` +
      'checking the named key would refuse the list. Fix the publisher input or the signing key so the two agree.',
  )
}

async function assertTheSignatureCoversTheServedBytes(
  publishedIndexPath: string,
  armoredPrivateKey: string,
): Promise<void> {
  const servedBytes = readFileSync(publishedIndexPath)
  const armoredSignature = readFileSync(`${publishedIndexPath}.sig`, 'utf8')
  const publicHalf = await publicHalfOfSigningKey(armoredPrivateKey)
  if (await verifyDetached(servedBytes, armoredSignature, publicHalf)) return

  throw new Error(
    `the signature beside ${publishedIndexPath} does not check out over the bytes being published. A reader ` +
      'reads that as tampering and refuses the list outright.',
  )
}

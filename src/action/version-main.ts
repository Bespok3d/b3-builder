// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { comparePromotionPackages, prepareCandidateVersion, prepareVersion } from './version-only.js'
import { verifyPackage } from './verify-package.js'

async function main(args: string[]): Promise<void> {
  const [operation, manifestOrCandidate, versionOrLive, runtimeOrVersion, publicKeyPath, daemon] = args
  if (!manifestOrCandidate || !versionOrLive) throw new Error('usage: version-main candidate|live <manifest> <version> [version.py]; compare <candidate.b3> <live.b3> <candidate-version> <public-key> [daemon]')
  if (operation === 'candidate') return prepareCandidateVersion(manifestOrCandidate, versionOrLive, runtimeOrVersion)
  if (operation === 'live') return prepareVersion(manifestOrCandidate, versionOrLive, runtimeOrVersion)
  if (operation !== 'compare' || !runtimeOrVersion || !publicKeyPath) throw new Error('compare requires candidate version and verification public key')
  const publicKey = readFileSync(publicKeyPath, 'utf8')
  await verifyPackage(manifestOrCandidate, publicKey, true)
  await verifyPackage(versionOrLive, publicKey, true)
  comparePromotionPackages(manifestOrCandidate, versionOrLive, runtimeOrVersion, daemon === 'daemon')
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

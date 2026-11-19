// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { JsonObject, PackedPackage } from '../types.js'
import { packageFilename } from './archive.js'
import { isCollection } from './entry.js'

// A catalog entry carries the same `fingerprint` as the signed manifest inside the .b3 it points at, so
// a reader decides "update available" by comparing what is installed with what is published, and a
// rebuild at an unchanged version is offered as an update. A collection ships no .b3 and so carries none.
export function withPackageFingerprints(atoms: JsonObject[], packages: PackedPackage[]): JsonObject[] {
  const fingerprintByFilename = new Map(packages.map((packed) => [packed.filename, packed.fingerprint]))
  return atoms.map((atom) => withPackageFingerprint(atom, fingerprintByFilename))
}

function withPackageFingerprint(atom: JsonObject, fingerprintByFilename: Map<string, string>): JsonObject {
  if (isCollection(atom)) return atom
  const filename = packageFilename(atom)
  const fingerprint = fingerprintByFilename.get(filename)
  if (fingerprint === undefined) {
    throw new Error(`catalog entry ${filename} has no packed .b3 to take its fingerprint from`)
  }
  return { ...atom, fingerprint }
}

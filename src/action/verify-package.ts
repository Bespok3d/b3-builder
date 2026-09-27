// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { JsonObject } from '../core/types.js'
import { publicKeyFingerprint, verifyDetached } from '../core/build/sign-bytes.js'

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function packageContents(path: string): { manifest: JsonObject; entries: Map<string, Buffer>; modes: Record<string, number> } {
  const zip = new AdmZip(path)
  const files = zip.getEntries().filter((entry) => !entry.isDirectory)
  const names = files.map((entry) => entry.entryName)
  if (new Set(names).size !== names.length || names.some((name) => name.startsWith('/') || name.split('/').includes('..'))) {
    throw new Error(`unsafe or duplicate package path: ${path}`)
  }
  const entries = new Map(files.map((entry) => [entry.entryName, entry.getData()]))
  const bytes = entries.get('manifest.json')
  if (!bytes) throw new Error(`missing manifest: ${path}`)
  return { manifest: JSON.parse(bytes.toString('utf8')) as JsonObject, entries, modes: Object.fromEntries(zip.getEntries().map((entry) => [entry.entryName, entry.attr >>> 16])) }
}

export async function verifyPackage(path: string, publicKey: string | undefined, requireSignature: boolean): Promise<JsonObject> {
  const { manifest, entries } = packageContents(path)
  verifyInventory(manifest, entries)
  const signature = entries.get('manifest.json.sig')
  if (requireSignature && (!signature || !publicKey)) throw new Error(`required package signature missing: ${path}`)
  if (!signature) return manifest
  if (!publicKey || !await verifyDetached(entries.get('manifest.json')!, signature.toString('utf8'), publicKey)) {
    throw new Error(`invalid package signature: ${path}`)
  }
  if (manifest.publisher !== await publicKeyFingerprint(publicKey)) throw new Error(`package publisher mismatch: ${path}`)
  return manifest
}

function verifyInventory(manifest: JsonObject, entries: Map<string, Buffer>): void {
  if (!Array.isArray(manifest.files)) throw new Error('package has no file inventory')
  const inventory = manifest.files as JsonObject[]
  const paths = inventory.map((entry) => String(entry.path))
  const payloadNames = [...entries.keys()].filter((name) => !['manifest.json', 'manifest.json.sig'].includes(name))
  if (new Set(paths).size !== paths.length || JSON.stringify([...paths].sort()) !== JSON.stringify(payloadNames.sort())) {
    throw new Error('package file inventory differs from extracted paths')
  }
  inventory.forEach((entry) => {
    if (!['644', '755'].includes(String(entry.mode)) || sha256(entries.get(String(entry.path))!) !== entry.sha256) {
      throw new Error(`package payload checksum or mode is invalid: ${String(entry.path)}`)
    }
  })
}

// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import type { JsonObject } from '../types.js'
import { asArray, asObject, asString } from './json.js'
import { serviceName } from './entry.js'

// A repo knows only the services its OWN plugins provide, but a `require` may name a service another
// publisher's plugin provides. Resolving against the repo alone left the raw service name standing in
// the catalog `deps`, where it reads as a plugin id no registry can ever serve. A provider source is a
// published index (the index-of-lists, or any sub-list) read for one thing: which plugin id provides
// which service. It is an INPUT, never a baked org default, on the same terms as every other identity
// this tool takes (ADR-0041).

export interface ServiceProvider {
  name: string
  provides: string[]
}

// A provider source is named as a path on disk or a URL, because the index a publisher resolves
// against is normally the one their registry already serves.
export async function readProviderSource(source: string): Promise<ServiceProvider[]> {
  const bytes = await providerSourceBytes(source)

  return providersInIndex(parsedIndex(bytes, source), source)
}

export async function readProviderSources(sources: readonly string[]): Promise<ServiceProvider[]> {
  const perSource = await Promise.all(sources.map(readProviderSource))

  return perSource.flat()
}

async function providerSourceBytes(source: string): Promise<string> {
  if (!isUrl(source)) return readFileSync(source, 'utf8')
  const response = await fetch(source)
  if (!response.ok) throw new Error(`provider source ${source} answered ${response.status}`)

  return response.text()
}

function isUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://')
}

// A source that is not a published index is the caller's mistake, and it is told as one: resolving
// against it silently would put the very dep name back that this reads the source to replace.
function parsedIndex(bytes: string, source: string): JsonObject {
  try {
    return asObject(JSON.parse(bytes))
  } catch {
    throw new Error(`provider source ${source} is not JSON`)
  }
}

function providersInIndex(index: JsonObject, source: string): ServiceProvider[] {
  const plugins = index.plugins
  if (!Array.isArray(plugins)) throw new Error(`provider source ${source} has no plugins in it`)

  return plugins.map((plugin) => ({
    name: asString(asObject(plugin).name),
    provides: asArray(asObject(plugin).provides).map(serviceName),
  }))
}

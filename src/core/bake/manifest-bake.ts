// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { JsonObject, JsonValue } from '../types.js'
import { asArray, asObject, asString } from '../build/json.js'
import type {
  ArchiveKind,
  BakeStep,
  DockerCBake,
  DockerKoBake,
  DownloadBake,
  DownloadFetch,
  GoBake,
  IncludeFile,
  KernelTarget,
  PayloadMember,
} from './bake-types.js'

// Parse the declarative `bake` manifest field (bake-types.ts) out of the opaque plugin manifest JSON: a
// manifest with no `bake` yields no steps (an ordinary plugin is untouched), each class parses into its
// typed shape with defaults, and a bad declaration fails loudly rather than silently skip a build. The
// types are re-exported here so a baker has one import site for both the shape and the parse.
export type {
  ArchiveKind,
  BakeStep,
  DockerCBake,
  DockerKoBake,
  DownloadBake,
  DownloadFetch,
  GoBake,
  IncludeFile,
  KernelTarget,
  PayloadMember,
} from './bake-types.js'

export function parseBakeSteps(manifest: JsonObject): BakeStep[] {
  return asArray(manifest.bake).map((entry) => parseStep(asObject(entry)))
}

function parseStep(entry: JsonObject): BakeStep {
  const bakeClass = asString(entry.class)
  const parser = STEP_PARSERS[bakeClass]
  if (parser === undefined) throw new Error(`unknown bake class "${bakeClass}" (expected go, download, docker-c, or docker-ko)`)
  return parser(entry)
}

function parseGo(entry: JsonObject): GoBake {
  return {
    class: 'go',
    source: required(entry, 'source'),
    commit: required(entry, 'commit'),
    package: asString(entry.package, '.'),
    output: required(entry, 'output'),
  }
}

function parseDownload(entry: JsonObject): DownloadBake {
  return {
    class: 'download',
    fetch: asArray(entry.fetch).map((fetch) => parseFetch(asObject(fetch))),
    include: asArray(entry.include).map((include) => parseInclude(asObject(include))),
  }
}

function parseFetch(fetch: JsonObject): DownloadFetch {
  return {
    url: required(fetch, 'url'),
    sha256: required(fetch, 'sha256'),
    archive: parseArchiveKind(asString(fetch.archive)),
    members: asArray(fetch.members).map((member) => parseMember(asObject(member))),
  }
}

function parseArchiveKind(value: string): ArchiveKind {
  if (value === 'deb' || value === 'tar.xz' || value === 'tar.gz') return value
  throw new Error(`unknown download archive "${value}" (expected deb, tar.xz, or tar.gz)`)
}

function parseMember(member: JsonObject): PayloadMember {
  return { path: required(member, 'path'), dest: required(member, 'dest'), mode: asString(member.mode, '0755') }
}

function parseInclude(include: JsonObject): IncludeFile {
  return { src: required(include, 'src'), dest: required(include, 'dest'), mode: asString(include.mode, '0755') }
}

function parseDockerC(entry: JsonObject): DockerCBake {
  return {
    class: 'docker-c',
    dockerfile: required(entry, 'dockerfile'),
    context: asString(entry.context, '.'),
    platform: asString(entry.platform, 'linux/arm64'),
    out: asString(entry.out, '/out'),
    members: asArray(entry.members).map((member) => parseMember(asObject(member))),
  }
}

function parseDockerKo(entry: JsonObject): DockerKoBake {
  return {
    class: 'docker-ko',
    dockerfile: required(entry, 'dockerfile'),
    context: asString(entry.context, '.'),
    module: required(entry, 'module'),
    out: asString(entry.out, '/out'),
    kernel: parseKernel(asObject(entry.kernel)),
    variantDest: required(entry, 'variant_dest'),
  }
}

function parseKernel(kernel: JsonObject): KernelTarget {
  return { release: required(kernel, 'release'), vermagic: required(kernel, 'vermagic') }
}

const STEP_PARSERS: Record<string, (entry: JsonObject) => BakeStep> = {
  go: parseGo,
  download: parseDownload,
  'docker-c': parseDockerC,
  'docker-ko': parseDockerKo,
}

function required(source: JsonObject, key: string): string {
  const value: JsonValue | undefined = source[key]
  if (typeof value !== 'string' || value === '') throw new Error(`bake step is missing required "${key}"`)
  return value
}
